export const calendarFilterFields = ["doctor", "branch", "department"] as const;

export function matchesCalendarFilters(appointment: any, params: URLSearchParams) {
  return calendarFilterFields.every((field) => {
    const selected = params.get(`${field}Id`);
    return !selected || (appointment[`${field}Id`] ?? appointment[field]?.id) === selected;
  });
}
