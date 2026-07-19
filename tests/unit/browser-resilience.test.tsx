import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneBoardData } from "@/lib/browser/clone-board-data";
import { newId } from "@/lib/ids/new-id";
import { roundedRectPath, type RoundedRectContext } from "@/lib/browser/rounded-rect-path";
import { observeElementSize } from "@/lib/browser/observe-element-size";
import { detectBrowserCapabilities } from "@/lib/browser/capabilities";
import { createBoard } from "@/core/board/factory";
import { UnsupportedBrowserScreen } from "@/components/unsupported-browser/unsupported-browser-screen";
import { usePersistenceStore } from "@/stores/persistence-store";

beforeEach(() => usePersistenceStore.setState({ error: null }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("browser fallbacks", () => {
  it("JSON-clones validated Draftspace data without changing serialization", () => {
    const native = globalThis.structuredClone;
    vi.stubGlobal("structuredClone", undefined);
    const board = createBoard("Portable"); const copy = cloneBoardData(board);
    expect(copy).toEqual(board); expect(copy).not.toBe(board);
    vi.stubGlobal("structuredClone", native);
  });

  it("creates unique RFC-4122-style IDs without randomUUID", () => {
    const original = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => { for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index + Math.random() * 255) & 255; return bytes; } });
    const ids = new Set(Array.from({ length: 25 }, () => newId()));
    expect(ids.size).toBe(25);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.stubGlobal("crypto", original);
  });

  it("preserves UUID version and variant markers in the final ID fallback", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_721_234_567_890);
    vi.spyOn(Math, "random").mockReturnValue(.25);
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.split("-")[2][0]).toBe("4");
    expect(id.split("-")[3][0]).toBe("8");
  });

  it("builds a rounded path with quadratic curves when roundRect is missing", () => {
    const context = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn() } as unknown as RoundedRectContext;
    roundedRectPath(context, 0, 0, 100, 60, 10);
    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.quadraticCurveTo).toHaveBeenCalledTimes(4);
  });

  it("uses window resize when ResizeObserver is missing", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 320, height: 180 } as DOMRect);
    const onSize = vi.fn(); const cleanup = observeElementSize(element, onSize);
    expect(onSize).toHaveBeenCalledWith({ width: 320, height: 180 });
    fireEvent(window, new Event("resize")); expect(onSize).toHaveBeenCalledTimes(2); cleanup();
  });

  it("reports blocking and soft capabilities", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ roundRect: vi.fn() } as unknown as CanvasRenderingContext2D);
    const capabilities = detectBrowserCapabilities();
    expect(capabilities.canvas2d).toBe(true); expect(capabilities).toHaveProperty("structuredClone"); expect(capabilities.roundedRect).toBe(true);
    getContext.mockRestore();
  });
});

describe("unsupported browser screen", () => {
  it("is accessible, reassuring, and offers backup only for a loaded board", () => {
    const download = vi.fn(async () => {});
    const { rerender } = render(<UnsupportedBrowserScreen canDownloadBackup={false} onDownloadBackup={download} />);
    expect(screen.getByRole("main")).toHaveAccessibleName("This browser can’t open the canvas");
    expect(screen.getByText("Your board has not been modified.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Download emergency backup" })).not.toBeInTheDocument();
    rerender(<UnsupportedBrowserScreen canDownloadBackup onDownloadBackup={download} />);
    fireEvent.click(screen.getByRole("button", { name: "Download emergency backup" }));
    expect(download).toHaveBeenCalledOnce();
  });

  it("clears a stale emergency-backup error after a successful retry", async () => {
    const download = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce(undefined);
    render(<UnsupportedBrowserScreen canDownloadBackup onDownloadBackup={download} />);
    fireEvent.click(screen.getByRole("button", { name: "Download emergency backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Draftspace could not download the backup file.");
    fireEvent.click(screen.getByRole("button", { name: "Download emergency backup" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(download).toHaveBeenCalledTimes(2);
  });
});
