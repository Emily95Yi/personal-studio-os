const paths = {
  logo: '<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1"/><circle cx="12" cy="12" r="4"/>',
  workshop: '<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  career: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18m-11 0v2h4v-2"/>',
  self: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  back: '<path d="M20 12H5m5 5-5-5 5-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m14 6 4 4M4 20l4-1 12-12-4-4L4 15v5Z"/>',
  remove: '<path d="M6 6l12 12M18 6 6 18"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 1l3-3a4 4 0 0 0-6-6l-2 2m2 4a4 4 0 0 0-6-1l-3 3a4 4 0 0 0 6 6l2-2"/>',
  import: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
};

export function icon(name, size = 18) {
  return '<svg aria-hidden="true" width="' + size + '" height="' + size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    (paths[name] ?? paths.arrow) + '</svg>';
}
