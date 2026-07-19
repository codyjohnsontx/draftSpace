import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolRail } from "@/components/toolbar/tool-rail";

describe("ToolRail", () => {
  it("describes each tool and its keyboard shortcut", () => {
    render(<ToolRail />);
    const tools = [
      { label: "Select", description: "Select, move, and resize objects", shortcut: "V" },
      { label: "Hand", description: "Pan around the canvas", shortcut: "H" },
      { label: "Rectangle", description: "Draw a rectangle", shortcut: "R" },
      { label: "Tool lock", description: "Keep a drawing tool active — coming soon", shortcut: null },
    ];
    for (const { label, description, shortcut } of tools) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveAccessibleName(label);
      expect(button).toHaveAttribute("type", "button");
      const descriptionId = button.getAttribute("aria-describedby");
      expect(descriptionId).toBeTruthy();
      const describedBy = document.getElementById(descriptionId!);
      expect(describedBy).toHaveTextContent(description);
      if (shortcut) expect(describedBy).toHaveTextContent(`Shortcut: ${shortcut}.`);
      expect(button).toHaveAccessibleDescription(shortcut ? `${description} Shortcut: ${shortcut}.` : description);
      expect(screen.getByRole("tooltip", { name: new RegExp(label) })).toHaveTextContent(description);
    }
  });
});
