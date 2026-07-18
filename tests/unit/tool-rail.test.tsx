import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolRail } from "@/components/toolbar/tool-rail";

describe("ToolRail", () => {
  it("describes each tool and its keyboard shortcut", () => {
    render(<ToolRail />);
    const select = screen.getByRole("button", { name: "Select" });
    const tooltipId = select.getAttribute("aria-describedby");
    expect(tooltipId).toBeTruthy();
    expect(document.getElementById(tooltipId!)).toHaveAttribute("role", "tooltip");
    expect(screen.getByRole("tooltip", { name: /Select/ })).toHaveTextContent("Select, move, and resize objects");
    expect(screen.getByRole("tooltip", { name: /Hand/ })).toHaveTextContent("Pan around the canvas");
    expect(screen.getByRole("tooltip", { name: /Rectangle/ })).toHaveTextContent("Draw a rectangle");
    expect(screen.getByRole("tooltip", { name: /Tool lock/ })).toHaveTextContent("coming soon");
  });
});
