export function pluralize(count: number, singular: string): string {
  return `${count.toLocaleString("en")} ${count === 1 ? singular : `${singular}s`}`;
}
