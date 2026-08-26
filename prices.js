export function loadPrices(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load prices.json:', err);
    return { services: [] };
  }
}

export function formatPriceList(prices) {
  if (!prices.services || prices.services.length === 0) {
    return 'Price list not available.';
  }

  const lines = ['PRICE LIST (for AI reference only):'];
  for (const svc of prices.services) {
    let line = `- ${svc.category} > ${svc.name}: `;
    if (Object.keys(svc.formats).length > 0) {
      const parts = [];
      for (const [fmt, price] of Object.entries(svc.formats)) {
        parts.push(`${fmt}: Rs. ${price}/${svc.unit}`);
      }
      line += parts.join(', ');
    } else if (svc.bulk_rules && svc.bulk_rules.length > 0) {
      line += 'Bulk pricing: ' + svc.bulk_rules.map(r => `${r.min_qty}+: ${r.note}`).join('; ');
    } else {
      line += 'Quote on request';
    }
    if (svc.notes) line += ` (${svc.notes})`;
    lines.push(line);
  }
  return lines.join('\n');
}

export function findService(prices, query) {
  const q = query.toLowerCase();
  for (const svc of prices.services) {
    const name = svc.name.toLowerCase();
    const cat = svc.category.toLowerCase();
    if (q.includes(name) || q.includes(cat)) {
      return svc;
    }
  }
  return null;
}