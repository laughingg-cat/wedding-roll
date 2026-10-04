import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WelcomeForm } from "./WelcomeForm";

afterEach(() => vi.restoreAllMocks());

describe("WelcomeForm", () => {
  it("requires a name and consent before entering the camera", async () => {
    const user = userEvent.setup();
    render(<WelcomeForm eventName="Sam & Taylor" onJoined={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Enter the camera" }));
    expect(screen.getByText("Enter your name and accept the photo notice.")).toBeVisible();
  });

  it("registers the guest and advances to the camera", async () => {
    const user = userEvent.setup();
    const onJoined = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ redirectTo: "/camera" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<WelcomeForm eventName="Sam & Taylor" onJoined={onJoined} />);

    await user.type(screen.getByLabelText("Your name"), "Jordan");
    await user.click(screen.getByRole("checkbox", { name: /share the photos/i }));
    await user.click(screen.getByRole("button", { name: "Enter the camera" }));

    expect(await screen.findByText("You’re in. Opening the camera…")).toBeVisible();
    expect(onJoined).toHaveBeenCalledWith("/camera");
  });

  it("shows a safe server error without losing the entered name", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "This invitation has expired" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<WelcomeForm eventName="Sam & Taylor" onJoined={() => undefined} />);

    const name = screen.getByLabelText("Your name");
    await user.type(name, "Jordan");
    await user.click(screen.getByRole("checkbox", { name: /share the photos/i }));
    await user.click(screen.getByRole("button", { name: "Enter the camera" }));

    expect(await screen.findByText("This invitation has expired")).toBeVisible();
    expect(name).toHaveValue("Jordan");
  });
});

