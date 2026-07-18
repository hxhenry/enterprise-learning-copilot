import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PresentationGuide } from "@/components/demo/presentation-guide";
import { PRESENTATION_SCENARIOS } from "@/lib/demo/presentation-scenarios";

describe("PresentationGuide", () => {
  it("presents the four guided demo scenarios", () => {
    render(
      <PresentationGuide
        disabled={false}
        onSelectPrompt={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Guided demo" }),
    ).toBeInTheDocument();

    for (const scenario of PRESENTATION_SCENARIOS) {
      expect(
        screen.getByRole("button", {
          name: `Run demo scenario: ${scenario.title}`,
        }),
      ).toBeEnabled();

      expect(screen.getByText(`“${scenario.prompt}”`)).toBeInTheDocument();
    }
  });

  it("passes the selected scenario prompt to the parent", () => {
    const onSelectPrompt = vi.fn();
    const scenario = PRESENTATION_SCENARIOS[1];

    render(
      <PresentationGuide
        disabled={false}
        onSelectPrompt={onSelectPrompt}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `Run demo scenario: ${scenario.title}`,
      }),
    );

    expect(onSelectPrompt).toHaveBeenCalledOnce();
    expect(onSelectPrompt).toHaveBeenCalledWith(scenario.prompt);
  });

  it("disables every scenario and explains why", () => {
    const onSelectPrompt = vi.fn();

    render(
      <PresentationGuide disabled onSelectPrompt={onSelectPrompt} />,
    );

    const explanation =
      "Finish the current response or approval before starting another guided scenario.";

    expect(screen.getByRole("status")).toHaveTextContent(explanation);

    for (const scenario of PRESENTATION_SCENARIOS) {
      const button = screen.getByRole("button", {
        name: `Run demo scenario: ${scenario.title}`,
      });

      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(explanation);

      fireEvent.click(button);
    }

    expect(onSelectPrompt).not.toHaveBeenCalled();
  });
});
