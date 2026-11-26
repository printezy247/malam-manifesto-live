export function getCanvas(orientation) {
  if (orientation === 'portrait') return { width: 1080, height: 1920 };
  if (orientation === 'landscape') return { width: 1920, height: 1080 };
  throw new TypeError('Unsupported orientation');
}

export function validateRegions(regions, canvas) {
  const issues = [];
  if (!canvas || !Number.isSafeInteger(canvas.width) || !Number.isSafeInteger(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
    return [{ code: 'CANVAS', message: 'Canvas dimensions must be positive safe integers' }];
  }
  if (!Array.isArray(regions)) return [{ code: 'REGIONS', message: 'Regions must be an array' }];
  const valid = [];
  for (const [index, region] of regions.entries()) {
    if (!region || typeof region.role !== 'string' || !region.role.trim() ||
        !['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(region[key])) ||
        region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 ||
        region.x > canvas.width - region.width || region.y > canvas.height - region.height) {
      issues.push({ code: 'BOUNDS', index, message: 'Region must have a role and fit inside the canvas using integer coordinates' });
    } else valid.push({ region, index });
  }
  for (const { region, index } of valid) {
    if (!['caption', 'disclosure'].includes(region.role)) continue;
    for (const { region: exclusion } of valid) {
      if (exclusion.role === 'platform-exclusion' &&
          region.x < exclusion.x + exclusion.width && region.x + region.width > exclusion.x &&
          region.y < exclusion.y + exclusion.height && region.y + region.height > exclusion.y) {
        issues.push({ code: 'PROTECTED_OVERLAP', index, message: 'Protected text overlaps a platform exclusion' });
      }
    }
  }
  return issues;
}
