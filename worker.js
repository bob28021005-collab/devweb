/* ==========================================================================
   LocalData Pro - Web Worker Engine (10 Formats + Chunked Streaming)
   ========================================================================== */

try {
  importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js',
    'https://cdn.jsdelivr.net/npm/fast-xml-parser@4.3.6/src/fxp.min.js'
  );
} catch (e) {
  console.warn('CDN scripts loading failed in worker.');
}

self.onmessage = async function (e) {
  const { action, file, mode, options, isPro } = e.data;

  if (action === 'PREVIEW') {
    generatePreview(file, mode, options);
    return;
  }

  if (action === 'START_CONVERT') {
    processFullConversion(file, mode, options, isPro);
  }
};

function generatePreview(file, mode, options) {
  const sliceSize = Math.min(file.size, 1024 * 64);
  const reader = new FileReaderSync();
  const sampleText = reader.readAsText(file.slice(0, sliceSize), 'UTF-8');

  try {
    let previewData = [];
    if (mode.startsWith('csv-') || mode === 'json-tsv') {
      const parsed = Papa.parse(sampleText, {
        preview: 50,
        delimiter: options.delimiter === 'auto' ? '' : options.delimiter,
        skipEmptyLines: options.skipEmptyLines
      });
      previewData = parsed.data;
    } else if (mode.startsWith('json-')) {
      const parsedJson = JSON.parse(sampleText.substring(0, sampleText.lastIndexOf('}') + 1) || '[]');
      previewData = Array.isArray(parsedJson) ? parsedJson.slice(0, 50) : [parsedJson];
    } else {
      previewData = [['샘플 텍스트'], [sampleText.substring(0, 500)]];
    }
    self.postMessage({ type: 'PREVIEW_READY', previewData });
  } catch (err) {
    self.postMessage({ type: 'PREVIEW_READY', previewData: [['안내'], ['사전 미리보기를 지원하지 않는 구조이거나 구문 분석 중입니다.']] });
  }
}

async function processFullConversion(file, mode, options, isPro) {
  const chunkSize = 1024 * 1024 * 2;
  let offset = 0;
  const totalSize = file.size;
  const startTime = Date.now();
  let convertedChunks = [];

  let lineBuffer = '';
  let targetExtension = 'json';

  try {
    while (offset < totalSize) {
      const slice = file.slice(offset, offset + chunkSize);
      const reader = new FileReaderSync();
      const textChunk = reader.readAsText(slice, 'UTF-8');
      offset += chunkSize;

      const currentLoaded = Math.min(offset, totalSize);
      const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
      const speedMB = (currentLoaded / (1024 * 1024) / elapsedSec).toFixed(1);

      self.postMessage({
        type: 'PROGRESS',
        loaded: currentLoaded,
        total: totalSize,
        percent: Math.min(100, Math.round((currentLoaded / totalSize) * 100)),
        speedMB: speedMB
      });

      const combinedText = lineBuffer + textChunk;
      const lines = combinedText.split(/\r?\n/);
      lineBuffer = (offset < totalSize) ? lines.pop() : '';

      let processedText = '';

      switch (mode) {
        case 'csv-json':
          targetExtension = 'json';
          const csvParsed = Papa.parse(lines.join('\n'), {
            header: true,
            delimiter: options.delimiter === 'auto' ? '' : options.delimiter,
            skipEmptyLines: options.skipEmptyLines
          });
          processedText = JSON.stringify(csvParsed.data, null, 2);
          break;

        case 'json-csv':
          targetExtension = 'csv';
          try {
            const jsonObj = JSON.parse(lines.join('\n'));
            processedText = Papa.unparse(jsonObj);
          } catch(e) {
            const rows = lines.filter(l => l.trim()).map(l => JSON.parse(l));
            processedText = Papa.unparse(rows);
          }
          break;

        case 'csv-sql':
          targetExtension = 'sql';
          const table = options.tableName || 'my_table';
          const sqlParsed = Papa.parse(lines.join('\n'), { header: true, skipEmptyLines: true });
          processedText = sqlParsed.data.map(row => {
            const cols = Object.keys(row).map(c => `\`${c}\``).join(', ');
            const vals = Object.values(row).map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
            return `INSERT INTO \`${table}\` (${cols}) VALUES (${vals});`;
          }).join('\n') + '\n';
          break;

        case 'json-yaml':
          targetExtension = 'yaml';
          const jObj = JSON.parse(lines.join('\n'));
          processedText = jsyaml.dump(jObj);
          break;

        case 'yaml-json':
          targetExtension = 'json';
          const yObj = jsyaml.load(lines.join('\n'));
          processedText = JSON.stringify(yObj, null, 2);
          break;

        case 'xml-json':
          targetExtension = 'json';
          const parser = new XMLParser();
          const xmlObj = parser.parse(lines.join('\n'));
          processedText = JSON.stringify(xmlObj, null, 2);
          break;

        case 'json-xml':
          targetExtension = 'xml';
          const builder = new XMLBuilder({ format: true });
          processedText = builder.build(JSON.parse(lines.join('\n')));
          break;

        case 'json-tsv':
          targetExtension = 'tsv';
          const tsvObj = JSON.parse(lines.join('\n'));
          processedText = Papa.unparse(tsvObj, { delimiter: '\t' });
          break;

        case 'csv-split':
          targetExtension = 'split.csv';
          processedText = lines.slice(0, parseInt(options.splitLines) || 50000).join('\n');
          break;

        case 'base64-hex':
          targetExtension = 'txt';
          processedText = lines.map(line => {
            try { return atob(line.trim()); } catch(e) { return line; }
          }).join('\n');
          break;

        default:
          processedText = lines.join('\n');
      }

      convertedChunks.push(processedText);
    }

    const finalBlob = new Blob(convertedChunks, { type: 'text/plain;charset=utf-8' });
    const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || 'converted_data';
    const outputFilename = `${originalName}_converted.${targetExtension}`;

    self.postMessage({
      type: 'DONE',
      blob: finalBlob,
      filename: outputFilename
    });

  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      message: `연산 오류 (${error.message}). 파일 구문 또는 인코딩을 점검하세요.`
    });
  }
}
