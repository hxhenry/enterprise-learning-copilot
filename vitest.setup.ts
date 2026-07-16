import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (
  typeof HTMLElement !== "undefined" &&
  !HTMLElement.prototype.scrollIntoView
) {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  });
}

afterEach(() => {
  cleanup();
});
