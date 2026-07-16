"use client";

import { useEffect, useRef } from "react";

import type { ApprovalRequest } from "@/lib/schemas/events";

type ApprovalRequestCardProps = {
  request: ApprovalRequest;
  isSubmitting: boolean;
  onDecision: (
    approved: boolean,
  ) => void;
};

export function ApprovalRequestCard({
  request,
  isSubmitting,
  onDecision,
}: ApprovalRequestCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby="approval-request-title"
      aria-busy={isSubmitting}
      className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Human approval required
      </p>

      <h3
        id="approval-request-title"
        className="mt-1 text-lg font-semibold text-slate-900"
      >
        {request.title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-700">
        {request.description}
      </p>

      <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
        No enrollment record is created until you approve this action.
      </p>

      <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3">
        <p className="text-xs font-semibold text-slate-500">
          Action
        </p>

        <p className="mt-1 text-sm font-medium text-slate-800">
          Enroll in {request.courseTitle}
        </p>

        <p className="mt-3 text-xs font-semibold text-slate-500">
          Impact
        </p>

        <p className="mt-1 text-sm text-slate-600">
          {request.risk}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onDecision(true)}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve enrollment
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onDecision(false)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {isSubmitting ? (
        <p role="status" className="mt-3 text-xs font-medium text-amber-800">
          Submitting your decision…
        </p>
      ) : null}
    </section>
  );
}
