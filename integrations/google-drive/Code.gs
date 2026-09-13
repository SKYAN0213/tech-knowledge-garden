// Only these existing, publishable Markdown sources may leave Google Drive.
const ROOT_FOLDER_ID = '1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD';
const SOURCE_ROOTS = ['Editions', 'Knowledge', 'Signals', 'TrendTopics'];

function sha256(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function sourceSnapshot() {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const files = [];
  const paths = {};
  function visit(folder, prefix, depth) {
    if (depth > 8) throw new Error('Source folder nesting exceeds limit');
    const children = folder.getFiles();
    while (children.hasNext()) {
      const file = children.next();
      if (file.isTrashed() || file.getName() === '.DS_Store') continue;
      const name = file.getName();
      if (!name.endsWith('.md') || file.getMimeType().startsWith('application/vnd.google-apps.'))
        throw new Error('Only stored Markdown files are supported in source folders');
      if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name.startsWith('.'))
        throw new Error('Invalid source filename');
      const path = prefix + '/' + name;
      if (paths[path]) throw new Error('Duplicate source path: ' + path);
      if (file.getSize() > 1048576 || files.length >= 2000) throw new Error('Source limit exceeded');
      paths[path] = true;
      const before = file.getLastUpdated().toISOString();
      const content = file.getBlob().getDataAsString('UTF-8');
      if (file.getLastUpdated().toISOString() !== before) throw new Error('Source changed while reading; retry');
      files.push({path: path, content: content, sha256: sha256(content)});
    }
    const folders = folder.getFolders();
    const names = {};
    while (folders.hasNext()) {
      const child = folders.next();
      if (child.isTrashed()) continue;
      const name = child.getName();
      if (name.startsWith('.') || /[\\/]/.test(name) || names[name]) throw new Error('Invalid or duplicate folder');
      names[name] = true;
      visit(child, prefix + '/' + name, depth + 1);
    }
  }
  SOURCE_ROOTS.forEach(function (name) {
    const matches = root.getFoldersByName(name);
    if (!matches.hasNext()) throw new Error('Missing source root: ' + name);
    const folder = matches.next();
    if (matches.hasNext()) throw new Error('Duplicate source root: ' + name);
    const before = files.length;
    visit(folder, name, 0);
    if (files.length === before) throw new Error('Empty source root: ' + name);
  });
  files.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
  return {schema: 'tech-drive-source/v1', transport: 'apps-script-webapp', root_folder_id: ROOT_FOLDER_ID,
    roots: SOURCE_ROOTS, complete: true, exported_at: new Date().toISOString(), files: files};
}

function doGet() {
  try {
    return ContentService.createTextOutput(JSON.stringify(sourceSnapshot()))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    // A partial or failed read must never be interpreted as source deletion.
    return ContentService.createTextOutput(JSON.stringify({schema: 'tech-drive-source/v1', complete: false,
      error: String(error.message || error)})).setMimeType(ContentService.MimeType.JSON);
  }
}
