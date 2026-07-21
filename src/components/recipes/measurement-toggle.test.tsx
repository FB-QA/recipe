import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MeasurementToggle } from "./measurement-toggle";

describe("MeasurementToggle", () => {
  it("offers three measurement systems (no separate UK/Ireland target)", () => {
    render(<MeasurementToggle value="original" onChange={() => {}} />);
    for (const label of ["Original", "Metric", "Imperial"]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("option", { name: /UK|Ireland/i })).not.toBeInTheDocument();
  });

  it("has an accessible label and reflects the selected value", () => {
    render(<MeasurementToggle value="metric" onChange={() => {}} />);
    const select = screen.getByRole("combobox", { name: /measurement units/i });
    expect((select as HTMLSelectElement).value).toBe("metric");
  });

  it("reports the chosen system on change", () => {
    const onChange = vi.fn();
    render(<MeasurementToggle value="original" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "us" } });
    expect(onChange).toHaveBeenCalledWith("us");
  });
});
