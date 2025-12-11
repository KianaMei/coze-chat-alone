const fs = require('fs');
const path = require('path');

function getSize(dir) {
  let size = 0;
  try {
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      const st = fs.lstatSync(fp);
      size += st.isDirectory() ? getSize(fp) : st.size;
    });
  } catch (e) {}
  return size;
}

function countFiles(dir) {
  let count = 0;
  try {
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      const st = fs.lstatSync(fp);
      count += st.isDirectory() ? countFiles(fp) : 1;
    });
  } catch (e) {}
  return count;
}

const rootPath = 'C:/josbs/volcano-chat';
const dirs = [
  'coze_docs',
  'coze_docs/html',
  'coze_docs/md', 
  'coze_docs/txt',
  'get_docs',
  '.claude',
  '.orchids',
  'CHAT_WIDGET_PLAN.md'
];

const docTotalTargets = new Set(['coze_docs', 'get_docs', '.claude', '.orchids', 'CHAT_WIDGET_PLAN.md']);
let docTotal = 0;

console.log('文档目录大小统计:\n');
dirs.forEach(d => {
  const fp = path.join(rootPath, d);
  try {
    const st = fs.lstatSync(fp);
    if (st.isDirectory()) {
      const size = getSize(fp);
      const files = countFiles(fp);
      if (docTotalTargets.has(d)) {
        docTotal += size;
      }
      console.log(`${d}: ${(size / 1024).toFixed(2)} KB (${files} 个文件)`);
    } else {
      if (docTotalTargets.has(d)) {
        docTotal += st.size;
      }
      console.log(`${d}: ${(st.size / 1024).toFixed(2)} KB`);
    }
  } catch (e) {
    console.log(`${d}: 不存在`);
  }
});

const projectTotal = getSize(rootPath);
const ratio = projectTotal ? ((docTotal / projectTotal) * 100).toFixed(2) : '0.00';
console.log(`\n文档总计: ${(docTotal / 1024).toFixed(2)} KB`);
console.log(`项目总计: ${(projectTotal / 1024).toFixed(2)} KB`);
console.log(`文档占比: ${ratio}%`);