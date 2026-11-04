const paths = {
  logo: '<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1"/><circle cx="12" cy="12" r="4"/>',
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/>',
  workshop: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M7 3v6m10-6v6M3 12h18"/>',
  career: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18m-11 0v2h4v-2"/>',
  self: '<path d="M12 5v15M3 4c4 0 7 1 9 3 2-2 5-3 9-3v14c-4 0-7 1-9 3-2-2-5-3-9-3Z"/>',
  connections: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4m-6 8 6 4"/>',
  pen: '<path d="M3 21l5-1 12-12a3 3 0 0 0-4-4L4 16zM13 7l4 4"/>',
  publish: '<path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  inbox: '<path d="M3 5h18v14H3zM3 13h5l2 3h4l2-3h5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  up: '<path d="M6 18 18 6M8 6h10v10"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

export function icon(name, size = 18) {
  return '<svg aria-hidden="true" width="' + size + '" height="' + size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    (paths[name] ?? paths.arrow) + '</svg>';
}
