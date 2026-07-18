import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ApprovalRequestCard } from "@/components/learning/approval-request-card";
import type { ApprovalRequest } from "@/lib/schemas/events";

const request: ApprovalRequest = {
  actionId: "action-123",
  actionType: "course-enrollment",
  title: "Approve course enrollment",
  description:
    "Enroll Henry in Secure Cloud Networking.",
  userId: "user-001",
  courseId: "course-network-301",
  courseTitle:
    "Secure Cloud Networking",
  risk:
    "This action creates an enrollment record and changes application data.",
};

describe("ApprovalRequestCard", () => {
  it("announces and focuses the approval boundary", () => {
    render(
      <ApprovalRequestCard
        request={request}
        isSubmitting={false}
        onDecision={() => undefined}
      />,
    );

    const approvalRegion = screen.getByRole("region", {
      name: "Approve course enrollment",
    });

    expect(approvalRegion).toHaveFocus();
    expect(approvalRegion).toHaveAttribute("aria-busy", "false");
    expect(
      screen.getByText(
        "No enrollment record is created until you approve this action.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the action and its impact", () => {
    render(
      <ApprovalRequestCard
        request={request}
        isSubmitting={false}
        onDecision={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Approve course enrollment",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Enroll in Secure Cloud Networking",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(request.risk),
    ).toBeInTheDocument();
  });

  it("submits an approval decision", () => {
    const onDecision = vi.fn();

    render(
      <ApprovalRequestCard
        request={request}
        isSubmitting={false}
        onDecision={onDecision}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Approve enrollment",
      }),
    );

    expect(onDecision).toHaveBeenCalledWith(
      true,
    );
  });

  it("submits a rejection decision", () => {
    const onDecision = vi.fn();

    render(
      <ApprovalRequestCard
        request={request}
        isSubmitting={false}
        onDecision={onDecision}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reject",
      }),
    );

    expect(onDecision).toHaveBeenCalledWith(
      false,
    );
  });

  it("disables decisions while submitting", () => {
    render(
      <ApprovalRequestCard
        request={request}
        isSubmitting
        onDecision={() => undefined}
      />,
    );

    expect(
      screen.getByRole("region", {
        name: "Approve course enrollment",
      }),
    ).toHaveAttribute("aria-busy", "true");

    expect(
      screen.getByRole("button", {
        name: "Approve enrollment",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Reject",
      }),
    ).toBeDisabled();
  });
});
