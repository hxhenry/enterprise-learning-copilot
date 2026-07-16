import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PresentationGuide } from "@/components/demo/presentation-guide";
import { PRESENTATION_SCENARIOS } from "@/lib/demo/presentation-scenarios";

describe("PresentationGuide", () => {
  it("offers every seeded presentation scenario in walkthrough order", () => {
    render(
      <PresentationGuide
        disabled={false}
        onSelectPrompt={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Four moments to show" }),
    ).toBeInTheDocument();

    const scenarioButtons = screen.getAllByRole("button");

    expect(scenarioButtons).toHaveLength(PRESENTATION_SCENARIOS.length);
    expect(
      scenarioButtons.map((button) => button.textContent),
    ).toEqual(
      PRESENTATION_SCENARIOS.map((scenario) =>
        expect.stringContaining(scenario.title),
      ),
    );
  });

  it.each(PRESENTATION_SCENARIOS)(
    "loads the $title prompt into the composer",
    (scenario) => {
      const onSelectPrompt = vi.fn();

      render(
        <PresentationGuide
          disabled={false}
          onSelectPrompt={onSelectPrompt}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(scenario.title, "i") }),
      );

      expect(onSelectPrompt).toHaveBeenCalledOnce();
      expect(onSelectPrompt).toHaveBeenCalledWith(scenario.prompt);
    },
  );

  it("disables every scenario while the chat cannot accept a prompt", () => {
    render(
      <PresentationGuide
        disabled
        onSelectPrompt={() => undefined}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
