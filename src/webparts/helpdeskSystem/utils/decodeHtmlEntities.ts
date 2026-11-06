// Decode entities only: never interpret the surrounding text as HTML markup.
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, entity =>
    new DOMParser().parseFromString(entity, 'text/html').body.textContent || entity);
}
