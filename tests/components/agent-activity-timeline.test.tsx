import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentActivityTimeline } from "@/components/agents/agent-activity-timeline";
import type { AgentActivity } from "@/lib/schemas/events";

const activities: AgentActivity[] = [
  {
    id: "route-certification",
    kind: "agent",
    name: "certificationAgent",
    detail: "Selected for employee certification progress.",
    status: "completed",
  },
  {
    id: "tool-progress",
    kind: "tool",
    name: "getCertificationProgress",
    detail: "Reading trusted certification data.",
    status: "running",
  },
  {
    id: "approval-enrollment",
    kind: "approval",
    name: "Course enrollment",
    detail: "Waiting for an explicit enrollment decision.",
    status: "stopped",
  },
];

describe("AgentActivityTimeline", () => {
  it("renders no workflow trace for an empty activity list", () => {
    const { container } = render(
      <AgentActivityTimeline activities={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("labels route, tool, and approval workflow boundaries", () => {
    render(<AgentActivityTimeline activities={activities} />);

    expect(
      screen.getByRole("region", { name: "Workflow trace" }),
    ).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");

    expect(items).toHaveLength(3);

    expect(within(items[0]).getByText("Route")).toBeInTheDocument();
    expect(
      within(items[0]).getByText("Certification Agent"),
    ).toBeInTheDocument();
    expect(within(items[0]).getByText("Completed")).toBeInTheDocument();

    expect(within(items[1]).getByText("Tool")).toBeInTheDocument();
    expect(
      within(items[1]).getByText("Get Certification Progress"),
    ).toBeInTheDocument();
    expect(within(items[1]).getByText("Running")).toBeInTheDocument();

    expect(within(items[2]).getByText("Approval")).toBeInTheDocument();
    expect(
      within(items[2]).getByText("Course enrollment"),
    ).toBeInTheDocument();
    expect(within(items[2]).getByText("Stopped")).toBeInTheDocument();
  });
});
