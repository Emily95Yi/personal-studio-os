const paths = {
  logo: '<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1"/><circle cx="12" cy="12" r="4"/>',
  workshop: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M7 3v6m10-6v6M3 12h18"/>',
  career: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18m-11 0v2h4v-2"/>',
  self: '<path d="M12 5v15M3 4c4 0 7 1 9 3 2-2 5-3 9-3v14c-4 0-7 1-9 3-2-2-5-3-9-3Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  back: '<path d="M20 12H5m5 5-5-5 5-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
};

export function icon(name, size = 18) {
  return '<svg aria-hidden="true" width="' + size + '" height="' + size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    (paths[name] ?? paths.arrow) + '</svg>';
}
