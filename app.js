/* ==========================================================================
   LocalData Pro - Main UI, License Verification & Multilingual SEO Manager
   SafeDataConvert의 메인 스크립트 파일입니다.
   - Web Worker 백그라운드 스트리밍 통신
   - 파일 드래그 앤 드롭 및 용량 검증 (Free 10MB, Pro 500MB)
   - 7개 국어 다국어 실시간 전환 및 SEO 메타 태그 동기화
   - Polar 라이선스 영구 인증 연동
   - [신규] 하단 FAQ 단일 아코디언 인터랙션 제어
   ========================================================================== */

const MAX_FREE_SIZE = 10 * 1024 * 1024;      // 10MB (무료 버전 한도)
const MAX_PRO_SIZE = 500 * 1024 * 1024;     // 500MB (Pro 라이선스 스트리밍 한도)
const POLAR_LICENSE_API = 'https://api.polar.sh/v1/customer-portal/license-keys/activate';

let worker = null;
let currentSelectedFile = null;
let conversionStartTime = 0;

// DOM 캐싱 (자주 사용하는 화면 요소 참조)
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const selectedFileInfo = document.getElementById('selected-file-info');
const conversionMode = document.getElementById('conversion-mode');
const btnConvert = document.getElementById('btn-convert');
const btnCancel = document.getElementById('btn-cancel');
const progressSection = document.getElementById('progress-section');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercent = document.getElementById('progress-percent');
const speedIndicator = document.getElementById('speed-indicator');
const elapsedTimeIndicator = document.getElementById('elapsed-time');
const processedBytes = document.getElementById('processed-bytes');
const previewSection = document.getElementById('preview-section');
const previewTableContainer = document.getElementById('preview-table-container');

// 모달 및 라이선스 DOM
const licenseModal = document.getElementById('license-modal');
const btnOpenLicense = document.getElementById('btn-open-license');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnActivateKey = document.getElementById('btn-activate-key');
const licenseKeyInput = document.getElementById('license-key-input');
const activationMsg = document.getElementById('activation-msg');

// 🌍 언어별 SEO 메타데이터 (탭 제목 및 검색 설명 동적 변경용)
const seoMetadata = {
  ko: {
    title: "안전한 데이터 변환 사이트 - SafeDataConvert | CSV JSON SQL XML YAML",
    description: "외부 서버 전송 0바이트! 브라우저 로컬 환경에서 500MB 대용량 데이터를 안전하고 빠르게 변환하는 CSV, JSON, SQL, YAML, XML 안전한 데이터 변환 유틸리티."
  },
  en: {
    title: "Secure Data Converter - SafeDataConvert | CSV, JSON, SQL, YAML",
    description: "0 bytes sent to external servers! 100% client-side secure data conversion tool for large CSV, JSON, SQL, XML, and YAML files in your browser."
  },
  zh: {
    title: "安全的数据转换网站 - SafeDataConvert | CSV JSON SQL",
    description: "零服务器数据传输！在浏览器本地环境中安全、快速转换大型 CSV、JSON、SQL 数据的工具。"
  },
  ja: {
    title: "安全なデータ変換サイト - SafeDataConvert | CSV JSON SQL",
    description: "外部サーバーへの送信0バイト！ブラウザのローカル環境で大容量データを安全かつ高速に変換するCSV・JSON・SQLツール。"
  },
  de: {
    title: "Sicherer Datenkonverter - SafeDataConvert | CSV, JSON, SQL",
    description: "0 Bytes an externe Server gesendet! 100% clientseitiges, sicheres Tool zur Datenkonvertierung direkt in Ihrem Browser."
  },
  es: {
    title: "Convertidor de Datos Seguro - SafeDataConvert | CSV, JSON, SQL",
    description: "¡0 bytes enviados a servidores externos! Herramienta 100% segura en el navegador para convertir CSV, JSON y SQL."
  },
  fr: {
    title: "Convertisseur de Données Sécurisé - SafeDataConvert | CSV, JSON, SQL",
    description: "0 octet envoyé aux serveurs externes ! Outil 100% sécurisé côté client pour convertir des fichiers CSV, JSON et SQL."
  }
};

// 🌍 7개 국어 i18n 딕셔너리
const i18nDict = {
  ko: {
    security_badge: "외부 서버 통신 0바이트 (100% 로컬 연산)",
    license_btn: "Pro 라이선스 인증",
    hero_title: "안전한 브라우저 로컬 데이터 변환기",
    hero_desc: "사내 기밀 및 대용량 데이터를 외부 클라우드 전송 없이 PC 메모리 내에서 직접 스트리밍 변환합니다.",
    mode_label: "변환 모드 선택:",
    opt_delimiter: "CSV 구분자:",
    opt_auto: "자동 감지 (Auto)",
    opt_table: "SQL 테이블명:",
    opt_split: "분할 행 수 (Lines):",
    opt_skip: "빈 줄 및 손상 행 자동 무시",
    dropzone_title: "파일을 끌어다 놓거나 클릭하여 선택하세요",
    dropzone_hint: "무료 10MB 지원 | Pro 라이선스 최대 500MB 스트리밍",
    prog_status: "대용량 로컬 스트리밍 변환 중...",
    hardware_notice: "⚠️ 보안을 위해 PC(로컬)에서 직접 연산됩니다. 파일 용량 및 고객님의 PC 사양(CPU/RAM)에 따라 작업 시간에 변동이 있을 수 있습니다.",
    btn_convert: "변환 시작 및 다운로드",
    btn_cancel: "작업 중단",
    preview_title: "데이터 사전 미리보기 (상위 50행)",
    preview_tag: "Dry-Run 무결성 검증",
    trust_title: "💡 외부 전송 0바이트 직접 확인하기",
    trust_desc: "브라우저에서 F12 키를 눌러 Network(네트워크) 탭을 연 후 변환을 실행해 보세요. 외부 서버로 나가는 데이터 패킷이 정확히 0바이트임을 직접 검증할 수 있습니다.",
    modal_title: "Pro 라이선스 인증",
    modal_desc: "1회 결제로 대용량(최대 500MB) Web Worker 스트리밍 엔진을 평생 영구 해금하세요. (월 구독료 0원)",
    plan_personal: "Personal Pro",
    plan_team: "Team License",
    plan_one_time: "/ 1회 영구 결제",
    p1_1: "1대 기기(PC) 평생 등록",
    p1_2: "최대 500MB 스트리밍 처리",
    p1_3: "10종 전체 변환기 무제한",
    t1_1: "4대 기기 동시 활성화",
    t1_2: "부서 공유 및 분할 저장 지원",
    t1_3: "우선 순위 업데이트 지원",
    buy_p: "Personal 구매",
    buy_t: "Team 구매",
    lbl_key: "구매한 라이선스 키 입력:",
    btn_activate: "정품 인증",
    recovery_text: "* 키를 분실하셨나요?",
    recovery_link: "주문 내역 자동 조회"
  },
  en: {
    security_badge: "0 Bytes External Transmission (100% Local)",
    license_btn: "Pro License Activation",
    hero_title: "Secure Browser-Local Data Converter",
    hero_desc: "Stream and convert sensitive corporate and large data directly in your PC memory without cloud upload.",
    mode_label: "Conversion Mode:",
    opt_delimiter: "CSV Delimiter:",
    opt_auto: "Auto Detect",
    opt_table: "SQL Table Name:",
    opt_split: "Split Lines:",
    opt_skip: "Auto-skip empty & corrupted rows",
    dropzone_title: "Drag & drop files here or click to select",
    dropzone_hint: "Free 10MB limit | Pro license up to 500MB streaming",
    prog_status: "Streaming & Converting Locally...",
    hardware_notice: "⚠️ Processed 100% locally on your PC for security. Processing time varies based on file size and hardware specs.",
    btn_convert: "Start Conversion & Download",
    btn_cancel: "Cancel",
    preview_title: "Data Preview (Top 50 Rows)",
    preview_tag: "Dry-Run Integrity Check",
    trust_title: "💡 Verify 0 Bytes External Transmission",
    trust_desc: "Press F12 in your browser, open the Network tab, and run a conversion. You can verify directly that outgoing data packets are exactly 0 bytes.",
    modal_title: "Pro License Activation",
    modal_desc: "Unlock the high-capacity (up to 500MB) Web Worker streaming engine for life with a single payment. ($0 monthly)",
    plan_personal: "Personal Pro",
    plan_team: "Team License",
    plan_one_time: "/ lifetime",
    p1_1: "1 Device (PC) Lifetime Registration",
    p1_2: "Up to 500MB Streaming Processing",
    p1_3: "All 10 Converters Unlimited",
    t1_1: "4 Devices Simultaneous Activation",
    t1_2: "Department Sharing & Split Export",
    t1_3: "Priority Updates Support",
    buy_p: "Buy Personal",
    buy_t: "Buy Team",
    lbl_key: "Enter License Key:",
    btn_activate: "Activate",
    recovery_text: "* Lost your key?",
    recovery_link: "Lookup Order History"
  },
  zh: {
    security_badge: "外部服务器传输 0 字节 (100% 本地计算)",
    license_btn: "Pro 许可证激活",
    hero_title: "安全的浏览器本地数据转换器",
    hero_desc: "无需上传至云端，直接在 PC 内存中流式转换机密和大型数据。",
    mode_label: "转换模式:",
    opt_delimiter: "CSV 分隔符:",
    opt_auto: "自动检测",
    opt_table: "SQL 表名:",
    opt_split: "分割行数:",
    opt_skip: "自动忽略空行与损坏行",
    dropzone_title: "将文件拖放到此处，或点击选择",
    dropzone_hint: "免费支持 10MB | Pro 许可证支持高达 500MB 流式处理",
    prog_status: "正在本地流式转换中...",
    hardware_notice: "⚠️ 为保障安全，所有运算均在您的 PC 本地完成。处理时间取决于文件大小与硬件配置。",
    btn_convert: "开始转换并下载",
    btn_cancel: "取消操作",
    preview_title: "数据预览 (前 50 行)",
    preview_tag: "Dry-Run 完整性验证",
    trust_title: "💡 直接验证外部传输为 0 字节",
    trust_desc: "在浏览器中按下 F12 键，打开 Network(网络) 选项卡后执行转换。您可以亲自验证发送到外部服务器的数据包正好为 0 字节。",
    modal_title: "Pro 许可证激活",
    modal_desc: "一次付费，终身解锁大容量（最高 500MB）Web Worker 流式引擎。（零月租）",
    plan_personal: "Personal Pro",
    plan_team: "Team License",
    plan_one_time: "/ 终身买断",
    p1_1: "1 台设备 (PC) 终身绑定",
    p1_2: "最高 500MB 流式传输处理",
    p1_3: "10 种转换器全部无限使用",
    t1_1: "4 台设备同时激活",
    t1_2: "支持部门共享与拆分导出",
    t1_3: "优先更新支持",
    buy_p: "购买 Personal",
    buy_t: "购买 Team",
    lbl_key: "输入购买的许可证密钥:",
    btn_activate: "激活正版",
    recovery_text: "* 找回密钥？",
    recovery_link: "自动查询订单历史"
  },
  ja: {
    security_badge: "外部サーバー通信 0バイト (100% ローカル演算)",
    license_btn: "Pro ライセンス認証",
    hero_title: "安全なブラウザローカルデータ変換ツール",
    hero_desc: "クラウドへのアップロードなしで、PCメモリ上で機密データや大容量データを直接ストリーミング変換します。",
    mode_label: "変換モード選択:",
    opt_delimiter: "CSV区切り文字:",
    opt_auto: "自動検出",
    opt_table: "SQLテーブル名:",
    opt_split: "分割行数:",
    opt_skip: "空行・破損行を自動スキップ",
    dropzone_title: "ファイルをドロップするか、クリックして選択",
    dropzone_hint: "無料10MBまで対応 | Proライセンスは最大500MBストリーミング",
    prog_status: "대용량 로컬 스트리밍 변환 중...",
    hardware_notice: "⚠️ セキュリティのためPC(ローカル)で直接演算されます。ファイル容量やPCスペックにより処理時間が変動します。",
    btn_convert: "変換開始 & ダウンロード",
    btn_cancel: "キャンセル",
    preview_title: "データプレビュー (上位50行)",
    preview_tag: "Dry-Run 整合性検証",
    trust_title: "💡 外部送信0バイトの直接確認",
    trust_desc: "ブラウザでF12を押し、Networkタブを開いて変換を実行してください。外部サーバーへの通信パケットが完全に0バイトであることを検証できます。",
    modal_title: "Pro ライセンス認証",
    modal_desc: "1회 결제로 대용량(최대 500MB) Web Worker 스트리밍 엔진을 평생 영구 해금하세요. (월 구독료 0원)",
    plan_personal: "Personal Pro",
    plan_team: "Team License",
    plan_one_time: "/ 買い切り",
    p1_1: "1대의 디바이스(PC) 평생 등록",
    p1_2: "최대 500MB 스트리밍 처리",
    p1_3: "10종 변환기 무제한 사용",
    t1_1: "4대 기기 동시 활성화",
    t1_2: "부서 공유 및 분할 저장 지원",
    t1_3: "우선 순위 업데이트 지원",
    buy_p: "Personal 購入",
    buy_t: "Team 購入",
    lbl_key: "購入したライセンスキーを入力:",
    btn_activate: "ライセンス認証",
    recovery_text: "* キーを紛失されましたか？",
    recovery_link: "注文履歴自動照会"
  },
  de: {
    security_badge: "0 Bytes externe Übertragung (100% lokal)",
    license_btn: "Pro-Lizenz aktivieren",
    hero_title: "Sicherer browser-lokaler Datenkonverter",
    hero_desc: "Konvertieren und streamen Sie sensible Daten direkt im PC-Speicher ohne Cloud-Upload.",
    mode_label: "Konvertierungsmodus:",
    opt_delimiter: "CSV-Trennzeichen:",
    opt_auto: "Automatisch",
    opt_table: "SQL-Tabellenname:",
    opt_split: "Zeilen aufteilen:",
    opt_skip: "Leere Zeilen überspringen",
    dropzone_title: "Dateien hierher ziehen oder klicken",
    dropzone_hint: "Kostenlos bis 10MB | Pro-Lizenz bis zu 500MB Streaming",
    prog_status: "Lokale Stream-Konvertierung läuft...",
    hardware_notice: "⚠️ Aus Sicherheitsgründen lokal auf Ihrem PC ausgeführt. Die Verarbeitungszeit hängt von Dateigröße und Hardware ab.",
    btn_convert: "Konvertierung starten & Herunterladen",
    btn_cancel: "Abbrechen",
    preview_title: "Datenvorschau (Top 50 Zeilen)",
    preview_tag: "Dry-Run Integritätsprüfung",
    trust_title: "💡 0 Bytes externe Übertragung verifizieren",
    trust_desc: "Drücken Sie F12, öffnen Sie den Netzwerk-Tab und starten Sie eine Konvertierung. Sie sehen, dass genau 0 Bytes übertragen werden.",
    modal_title: "Pro-Lizenz aktivieren",
    modal_desc: "Schalten Sie die Streaming-Engine für große Dateien (bis zu 500MB) mit einer einmaligen Zahlung dauerhaft frei.",
    plan_personal: "Personal Pro",
    plan_team: "Team License",
    plan_one_time: "/ einmalig",
    p1_1: "1 Gerät (PC) lebenslang",
    p1_2: "Bis zu 500MB Streaming",
    p1_3: "Alle 10 Konverter unbegrenzt",
    t1_1: "4 Geräte gleichzeitig aktivierbar",
    t1_2: "Abteilungsfreigabe & Split-Export",
    t1_3: "Priorisierter Support",
    buy_p: "Personal kaufen",
    buy_t: "Team kaufen",
    lbl_key: "Lizenzschlüssel eingeben:",
    btn_activate: "Aktivieren",
    recovery_text: "* Schlüssel verloren?",
    recovery_link: "Bestellverlauf anzeigen"
  },
  es: {
    security_badge: "0 Bytes de transmisión externa (100% local)",
    license_btn: "Activar Licencia Pro",
    hero_title: "Convertidor de Datos Local Seguro",
    hero_desc: "Convierta datos confidenciales directamente en la memoria de su PC sin subirlos a la nube.",
    mode_label: "Modo de conversión:",
    opt_delimiter: "Delimitador CSV:",
    opt_auto: "Automático",
    opt_table: "Nombre de tabla SQL:",
    opt_split: "Dividir filas:",
    opt_skip: "Omitir filas vacías",
    dropzone_title: "Arrastra archivos aquí o haz clic",
    dropzone_hint: "Gratis hasta 10MB | Licencia Pro streaming hasta 500MB",
    prog_status: "Convirtiendo localmente...",
    hardware_notice: "⚠️ Procesado localmente en su PC para mayor seguridad. El tiempo depende del tamaño y del hardware.",
    btn_convert: "Iniciar conversión y descargar",
    btn_cancel: "Cancelar",
    preview_title: "Vista previa de datos (50 filas)",
    preview_tag: "Verificación de integridad",
    trust_title: "💡 Verificar transmisión externa de 0 bytes",
    trust_desc: "Presione F12, abra la pestaña Red (Network) y ejecute una conversión para verificar que los paquetes salientes son exactamente 0 bytes.",
    modal_title: "Activar Licencia Pro",
    modal_desc: "Desbloquee el motor de streaming de gran capacidad (hasta 500MB) de por vida con un solo pago.",
    plan_personal: "Personal Pro",
    plan_team: "Team License",
    plan_one_time: "/ pago único",
    p1_1: "1 dispositivo (PC) de por vida",
    p1_2: "Streaming hasta 500MB",
    p1_3: "10 convertidores ilimitados",
    t1_1: "4 dispositivos simultáneos",
    t1_2: "Uso compartido y división",
    t1_3: "Soporte prioritario",
    buy_p: "Comprar Personal",
    buy_t: "Comprar Team",
    lbl_key: "Introduce tu clave de licencia:",
    btn_activate: "Activar",
    recovery_text: "* ¿Perdiste tu clave?",
    recovery_link: "Buscar historial de pedidos"
  },
  fr: {
    security_badge: "0 Octet de transmission externe (100% Local)",
    license_btn: "Activer la Licence Pro",
    hero_title: "Convertisseur de Données Local Sécurisé",
    hero_desc: "Convertissez vos données sensibles directement en local dans la mémoire de votre PC sans cloud.",
    mode_label: "Mode de conversion :",
    opt_delimiter: "Délimiteur CSV :",
    opt_auto: "Détection auto",
    opt_table: "Nom de table SQL :",
    opt_split: "Lignes par fichier :",
    opt_skip: "Ignorer les lignes vides",
    dropzone_title: "Glissez-déposez des fichiers ici ou cliquez",
    dropzone_hint: "Gratuit 10MB | Licence Pro streaming jusqu'à 500MB",
    prog_status: "Conversion et streaming en local...",
    hardware_notice: "⚠️ Traité 100% en local sur votre PC pour la sécurité. Le temps de traitement dépend de la taille et du matériel.",
    btn_convert: "Lancer la conversion et télécharger",
    btn_cancel: "Annuler",
    preview_title: "Aperçu des données (50 premières lignes)",
    preview_tag: "Vérification d'intégrité",
    trust_title: "💡 Vérifier la transmission externe de 0 octet",
    trust_desc: "Appuyez sur F12, ouvrez l'onglet Réseau (Network) et lancez une conversion. Vous constaterez que les paquets sortants sont exactement de 0 octet.",
    modal_title: "Activer la Licence Pro",
    modal_desc: "Débloquez le moteur de streaming haute capacité (jusqu'à 500MB) à vie en un seul paiement.",
    plan_personal: "Personal Pro",
    plan_team: "Team License",
    plan_one_time: "/ à vie",
    p1_1: "1 appareil (PC) enregistré à vie",
    p1_2: "Streaming jusqu'à 500MB",
    p1_3: "10 convertisseurs illimités",
    t1_1: "4 appareils activés simultanément",
    t1_2: "Partage et export fractionné",
    t1_3: "Mises à jour prioritaires",
    buy_p: "Acheter Personal",
    buy_t: "Acheter Team",
    lbl_key: "Entrer la clé de licence :",
    btn_activate: "Activer",
    recovery_text: "* Clé perdue ?",
    recovery_link: "Retrouver mes commandes"
  }
};

// 언어 변경 및 다국어 SEO 메타 태그 동기화 함수
function changeLanguage(lang) {
  const texts = i18nDict[lang] || i18nDict['en'];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (texts[key]) el.innerText = texts[key];
  });

  // 언어별 SEO 메타 태그 실시간 동기화
  const meta = seoMetadata[lang] || seoMetadata['en'];
  document.title = meta.title;
  
  const descTag = document.querySelector('meta[name="description"]');
  if (descTag) descTag.setAttribute('content', meta.description);
  
  const ogTitleTag = document.querySelector('meta[property="og:title"]');
  if (ogTitleTag) ogTitleTag.setAttribute('content', meta.title);
  
  const ogDescTag = document.querySelector('meta[property="og:description"]');
  if (ogDescTag) ogDescTag.setAttribute('content', meta.description);

  localStorage.setItem('localdata_lang', lang);
}

document.getElementById('language-select').addEventListener('change', (e) => {
  changeLanguage(e.target.value);
});

const savedLang = localStorage.getItem('localdata_lang') || 'ko';
document.getElementById('language-select').value = savedLang;
changeLanguage(savedLang);

// ==================== [1. Web Worker 백그라운드 엔진 초기화] ====================
function initWorker() {
  if (worker) worker.terminate();
  worker = new Worker('worker.js');

  worker.onmessage = function (e) {
    const data = e.data;

    if (data.type === 'PREVIEW_READY') {
      renderPreviewTable(data.previewData);
    } else if (data.type === 'PROGRESS') {
      progressSection.style.display = 'block';
      progressBarFill.style.width = `${data.percent}%`;
      progressPercent.innerText = `${data.percent}%`;
      speedIndicator.innerText = `속도: ${data.speedMB} MB/s`;
      processedBytes.innerText = `${(data.loaded / 1048576).toFixed(1)} MB / ${(data.total / 1048576).toFixed(1)} MB`;

      const elapsedSec = Math.floor((Date.now() - conversionStartTime) / 1000);
      elapsedTimeIndicator.innerText = `경과 시간: ${elapsedSec}초`;

    } else if (data.type === 'DONE') {
      saveResultFile(data.blob, data.filename);
      resetProgressState();
    } else if (data.type === 'ERROR') {
      alert(`[오류 발생] ${data.message}`);
      resetProgressState();
    }
  };
}

// ==================== [2. 드롭존 및 파일 선택 이벤트] ====================
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
  currentSelectedFile = file;
  selectedFileInfo.innerText = `선택된 파일: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  btnConvert.disabled = false;

  worker.postMessage({
    action: 'PREVIEW',
    file: file,
    mode: conversionMode.value,
    options: getOptions()
  });
}

// ==================== [3. 변환 실행 및 용량 검증 (Pro Gate)] ====================
btnConvert.addEventListener('click', async () => {
  if (!currentSelectedFile) return;

  const fileSize = currentSelectedFile.size;
  const isPro = localStorage.getItem('localdata_pro_valid') === 'true';

  if (fileSize > MAX_PRO_SIZE) {
    alert('브라우저 메모리 한계 보호를 위해 500MB 이하의 파일만 지원합니다.');
    return;
  }

  if (fileSize > MAX_FREE_SIZE && !isPro) {
    alert(`선택하신 파일(${(fileSize / 1048576).toFixed(1)}MB)은 무료 지원 용량(10MB)을 초과합니다. Pro 라이선스를 활성화해 주세요.`);
    licenseModal.style.display = 'flex';
    return;
  }

  btnConvert.disabled = true;
  btnCancel.style.display = 'inline-block';
  conversionStartTime = Date.now();

  worker.postMessage({
    action: 'START_CONVERT',
    file: currentSelectedFile,
    mode: conversionMode.value,
    options: getOptions(),
    isPro: isPro
  });
});

btnCancel.addEventListener('click', () => {
  initWorker();
  resetProgressState();
  alert('작업이 취소되었습니다.');
});

function getOptions() {
  return {
    delimiter: document.getElementById('csv-delimiter').value,
    tableName: document.getElementById('sql-table').value,
    splitLines: document.getElementById('split-lines').value,
    skipEmptyLines: document.getElementById('skip-empty-lines').checked
  };
}

// ==================== [4. 미리보기 테이블 렌더링] ====================
function renderPreviewTable(data) {
  previewSection.style.display = 'block';
  previewTableContainer.innerHTML = '';
  if (!data || data.length === 0) return;

  const table = document.createElement('table');
  data.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const rowData = Array.isArray(row) ? row : Object.values(row);
    rowData.forEach(cell => {
      const el = rowIndex === 0 ? document.createElement('th') : document.createElement('td');
      el.innerText = String(cell).substring(0, 100);
      tr.appendChild(el);
    });
    table.appendChild(tr);
  });
  previewTableContainer.appendChild(table);
}

// ==================== [5. 파일 저장 처리] ====================
async function saveResultFile(blob, filename) {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      alert('파일이 하드디스크에 성공적으로 저장되었습니다.');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}

function resetProgressState() {
  btnConvert.disabled = false;
  btnCancel.style.display = 'none';
  progressSection.style.display = 'none';
  progressBarFill.style.width = '0%';
  if(elapsedTimeIndicator) elapsedTimeIndicator.innerText = '경과 시간: 0초';
}

// ==================== [6. Polar 라이선스 활성화 연동] ====================
btnOpenLicense.addEventListener('click', () => licenseModal.style.display = 'flex');
btnCloseModal.addEventListener('click', () => licenseModal.style.display = 'none');

btnActivateKey.addEventListener('click', async () => {
  const licenseKey = licenseKeyInput.value.trim();
  if (!licenseKey) {
    activationMsg.innerText = '라이선스 키를 입력해 주세요.';
    activationMsg.style.color = 'var(--danger-color)';
    return;
  }

  activationMsg.innerText = '라이선스 키 검증 중...';
  activationMsg.style.color = 'var(--text-muted)';

  let instanceName = localStorage.getItem('localdata_instance_id');
  if (!instanceName) {
    instanceName = 'client_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('localdata_instance_id', instanceName);
  }

  try {
    const response = await fetch(POLAR_LICENSE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: licenseKey,
        meta: { instance_name: instanceName }
      })
    });
    
    const result = await response.json();

    if (response.ok && (result.id || result.status === 'active' || result.activated)) {
      localStorage.setItem('localdata_pro_valid', 'true');
      localStorage.setItem('localdata_license_key', licenseKey);
      activationMsg.innerText = '✅ Pro 라이선스가 성공적으로 활성화되었습니다!';
      activationMsg.style.color = 'var(--accent-green)';
      btnOpenLicense.innerText = 'Pro 활성화됨 (영구)';
      setTimeout(() => licenseModal.style.display = 'none', 1500);
    } else {
      activationMsg.innerText = `❌ 인증 실패: ${result.message || '유효하지 않은 키이거나 등록 기기 수를 초과했습니다.'}`;
      activationMsg.style.color = 'var(--danger-color)';
    }
  } catch (err) {
    activationMsg.innerText = '검증 서버 통신 실패 (네트워크 연결을 확인하세요).';
    activationMsg.style.color = 'var(--danger-color)';
  }
});

// UI 동적 옵션 전환
conversionMode.addEventListener('change', (e) => {
  const mode = e.target.value;
  document.getElementById('opt-delimiter').style.display = mode.startsWith('csv-') ? 'flex' : 'none';
  document.getElementById('opt-table-name').style.display = mode === 'csv-sql' ? 'flex' : 'none';
  document.getElementById('opt-split-lines').style.display = mode === 'csv-split' ? 'flex' : 'none';
  if (currentSelectedFile) handleFileSelect(currentSelectedFile);
});

// ==============================================================================
// 7. [신규] 하단 FAQ 아코디언 UX 향상 (하나를 열면 다른 열린 질문은 자동으로 닫힘)
// ==============================================================================
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('toggle', () => {
    if (item.open) {
      document.querySelectorAll('.faq-item').forEach(otherItem => {
        if (otherItem !== item && otherItem.open) {
          otherItem.open = false;
        }
      });
    }
  });
});

initWorker();
if (localStorage.getItem('localdata_pro_valid') === 'true') {
  btnOpenLicense.innerText = 'Pro 활성화됨 (영구)';
}