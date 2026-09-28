import { useState } from "react";

export function DoctorCommissionFields({ doctor }: { doctor?: { commissionType?: string; commissionValue?: number } }) {
  const [type, setType] = useState(doctor?.commissionType || "FLAT");
  const percentage = type === "PERCENTAGE";
  return <>
    <label>Commission type
      <select name="commissionType" value={type} onChange={(event) => setType(event.target.value)} required>
        <option value="FLAT">Flat</option>
        <option value="PERCENTAGE">Percentage</option>
      </select>
    </label>
    <label>{percentage ? "Commission percentage (%)" : "Commission amount"}
      <input name="commissionValue" type="number" min={0} max={percentage ? 100 : undefined} step="0.01" required defaultValue={doctor?.commissionValue ?? 0}/>
    </label>
  </>;
}
