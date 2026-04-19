/** Convert a Date to DD/MM/YYYY in Asia/Jerusalem timezone. */
export function emailDateToDDMMYYYY(d: Date): string {
  const il = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  );
  const yyyy = il.getFullYear();
  const mm = String(il.getMonth() + 1).padStart(2, "0");
  const dd = String(il.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}
