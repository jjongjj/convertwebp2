/**
 * ConvertWemp GUI - 렌더러 프로세스
 * 사용자 인터페이스 로직 및 이벤트 처리
 */

// Electron API 직접 접근 (임시로 nodeIntegration 사용)
const { ipcRenderer } = require('electron');
const path = require('path');

// DOM 요소들
const elements = {
    dropZone: document.getElementById('dropZone'),
    browseBtn: document.getElementById('browseBtn'),
    fileList: document.getElementById('fileList'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue'),
    effortSlider: document.getElementById('effortSlider'),
    effortValue: document.getElementById('effortValue'),
    losslessCheck: document.getElementById('losslessCheck'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    stopBtn: document.getElementById('stopBtn'),
    openFolderBtn: document.getElementById('openFolderBtn'),
    progressText: document.getElementById('progressText'),
    progressStats: document.getElementById('progressStats'),
    progressFill: document.getElementById('progressFill'),
    statusText: document.getElementById('statusText'),
    appVersion: document.getElementById('appVersion')
};

// 앱 상태
const appState = {
    files: [], // 선택된 파일들
    isProcessing: false,
    isPaused: false,
    completedCount: 0,
    totalCount: 0,
    currentSettings: {
        quality: 75,
        effort: 6,
        lossless: false
    }
};

/**
 * 초기화
 */
async function initialize() {
    setupEventListeners();
    setupDragAndDrop();
    updateUI();
    
    // 앱 정보 로드
    try {
        const appInfo = await ipcRenderer.invoke('get-app-info');
        elements.appVersion.textContent = `v${appInfo.version}`;
    } catch (error) {
        console.error('앱 정보 로드 실패:', error);
    }
    
    updateStatus('준비');
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
    // 파일 선택 버튼
    elements.browseBtn.addEventListener('click', selectFiles);
    
    // 설정 슬라이더
    elements.qualitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        elements.qualityValue.textContent = value;
        appState.currentSettings.quality = parseInt(value);
        clearPresetSelection();
    });
    
    elements.effortSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        elements.effortValue.textContent = value;
        appState.currentSettings.effort = parseInt(value);
        clearPresetSelection();
    });
    
    elements.losslessCheck.addEventListener('change', (e) => {
        appState.currentSettings.lossless = e.target.checked;
        clearPresetSelection();
    });
    
    // 프리셋 버튼들
    elements.presetBtns.forEach(btn => {
        btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
    
    // 컨트롤 버튼들
    elements.startBtn.addEventListener('click', startConversion);
    elements.pauseBtn.addEventListener('click', pauseConversion);
    elements.stopBtn.addEventListener('click', stopConversion);
    elements.openFolderBtn.addEventListener('click', openResultFolder);
    
    // IPC 이벤트 리스너
    ipcRenderer.on('conversion-progress', handleConversionProgress);
}

/**
 * 드래그 앤 드롭 설정
 */
function setupDragAndDrop() {
    // 드래그 이벤트 방지
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        return false;
    });
    
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        return false;
    });
    
    // 드롭 존 이벤트
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('drag-over');
    });
    
    elements.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
    });
    
    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files)
            .filter(file => file.name.toLowerCase().endsWith('.gif'))
            .map(file => file.path);
        
        if (files.length > 0) {
            addFiles(files);
        } else {
            updateStatus('GIF 파일만 지원됩니다');
        }
    });
    
    // 클릭으로도 파일 선택 가능
    elements.dropZone.addEventListener('click', selectFiles);
}

/**
 * 파일 선택 대화상자
 */
async function selectFiles() {
    try {
        const files = await ipcRenderer.invoke('select-files');
        if (files && files.length > 0) {
            addFiles(files);
        }
    } catch (error) {
        console.error('파일 선택 실패:', error);
        updateStatus('파일 선택 실패');
    }
}

/**
 * 파일 목록에 추가
 */
function addFiles(files) {
    // 중복 제거
    const newFiles = files.filter(file => 
        !appState.files.some(existingFile => existingFile.path === file)
    );
    
    // 파일 정보 생성
    const fileInfos = newFiles.map(filePath => ({
        path: filePath,
        name: path.basename(filePath),
        size: 0, // 실제 크기는 나중에 로드
        status: 'waiting', // waiting, processing, completed, error
        progress: 0,
        result: null
    }));
    
    appState.files.push(...fileInfos);
    appState.totalCount = appState.files.length;
    
    updateFileList();
    updateUI();
    updateStatus(`${appState.files.length}개 파일 선택됨`);
}

/**
 * 파일 목록 UI 업데이트
 */
function updateFileList() {
    if (appState.files.length === 0) {
        elements.fileList.innerHTML = '<div class="empty-state">변환할 파일이 없습니다. 위에서 파일을 선택해주세요.</div>';
        return;
    }
    
    const listHTML = appState.files.map((file, index) => {
        const statusIcon = getStatusIcon(file.status);
        const progressHTML = file.status === 'processing' ? 
            `<div class="file-progress">
                <div class="file-progress-bar" style="width: ${file.progress}%"></div>
            </div>` : '';
        
        const resultText = file.result ? 
            `${formatFileSize(file.result.originalSize)} → ${formatFileSize(file.result.compressedSize)}` : 
            '';
        
        return `
            <div class="file-item" data-index="${index}">
                <div class="file-info">
                    <div class="file-status">${statusIcon}</div>
                    <div class="file-details">
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${resultText}</div>
                    </div>
                </div>
                ${progressHTML}
            </div>
        `;
    }).join('');
    
    elements.fileList.innerHTML = listHTML;
}

/**
 * 상태 아이콘 반환
 */
function getStatusIcon(status) {
    const icons = {
        waiting: '⏸️',
        processing: '⏳',
        completed: '✅',
        error: '❌'
    };
    return icons[status] || '❓';
}

/**
 * 파일 크기 포맷팅
 */
function formatFileSize(bytes) {
    if (!bytes) return '';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 프리셋 적용
 */
function applyPreset(preset) {
    const presets = {
        auto: { quality: 75, effort: 6, lossless: false },
        quality: { quality: 90, effort: 6, lossless: false },
        compression: { quality: 60, effort: 6, lossless: false },
        default: { quality: 75, effort: 6, lossless: false }
    };
    
    const settings = presets[preset];
    if (!settings) return;
    
    // UI 업데이트
    elements.qualitySlider.value = settings.quality;
    elements.qualityValue.textContent = settings.quality;
    elements.effortSlider.value = settings.effort;
    elements.effortValue.textContent = settings.effort;
    elements.losslessCheck.checked = settings.lossless;
    
    // 상태 업데이트
    appState.currentSettings = { ...settings };
    
    // 프리셋 버튼 활성화
    elements.presetBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-preset="${preset}"]`).classList.add('active');
    
    updateStatus(`${preset} 프리셋 적용됨`);
}

/**
 * 프리셋 선택 해제
 */
function clearPresetSelection() {
    elements.presetBtns.forEach(btn => btn.classList.remove('active'));
}

/**
 * 변환 시작
 */
async function startConversion() {
    if (appState.files.length === 0) {
        updateStatus('변환할 파일이 없습니다');
        return;
    }
    
    appState.isProcessing = true;
    appState.isPaused = false;
    appState.completedCount = 0;
    
    // 파일 상태 초기화
    appState.files.forEach(file => {
        file.status = 'waiting';
        file.progress = 0;
        file.result = null;
    });
    
    updateUI();
    updateFileList();
    updateStatus('변환 중...');
    
    try {
        const filePaths = appState.files.map(file => file.path);
        const results = await ipcRenderer.invoke('convert-files', filePaths, appState.currentSettings);
        
        // 결과 처리는 progress 이벤트에서 처리됨
        updateStatus('변환 완료');
        
    } catch (error) {
        console.error('변환 실패:', error);
        updateStatus('변환 실패: ' + error.message);
    } finally {
        appState.isProcessing = false;
        updateUI();
    }
}

/**
 * 변환 일시정지
 */
function pauseConversion() {
    appState.isPaused = !appState.isPaused;
    updateStatus(appState.isPaused ? '일시정지됨' : '변환 중...');
    updateUI();
}

/**
 * 변환 중지
 */
function stopConversion() {
    appState.isProcessing = false;
    appState.isPaused = false;
    
    // 대기 중인 파일들 상태 초기화
    appState.files.forEach(file => {
        if (file.status === 'waiting' || file.status === 'processing') {
            file.status = 'waiting';
            file.progress = 0;
        }
    });
    
    updateFileList();
    updateUI();
    updateStatus('중지됨');
}

/**
 * 결과 폴더 열기
 */
async function openResultFolder() {
    if (appState.files.length === 0) return;
    
    try {
        const firstFile = appState.files[0];
        const folderPath = path.dirname(firstFile.path);
        await ipcRenderer.invoke('open-folder', folderPath);
    } catch (error) {
        console.error('폴더 열기 실패:', error);
        updateStatus('폴더 열기 실패');
    }
}

/**
 * 변환 진행상황 처리
 */
function handleConversionProgress(event, data) {
    const { fileIndex, fileName, status, result, error } = data;
    
    if (fileIndex >= 0 && fileIndex < appState.files.length) {
        const file = appState.files[fileIndex];
        file.status = status;
        
        if (status === 'processing') {
            file.progress = 50; // 중간 진행률
        } else if (status === 'completed') {
            file.progress = 100;
            file.result = result;
            appState.completedCount++;
        } else if (status === 'error') {
            file.progress = 0;
            file.error = error;
        }
        
        updateFileList();
        updateOverallProgress();
        
        if (appState.completedCount === appState.totalCount) {
            appState.isProcessing = false;
            updateUI();
            updateStatus(`모든 파일 변환 완료 (${appState.completedCount}/${appState.totalCount})`);
        }
    }
}

/**
 * 전체 진행률 업데이트
 */
function updateOverallProgress() {
    const progress = appState.totalCount > 0 ? 
        (appState.completedCount / appState.totalCount) * 100 : 0;
    
    elements.progressFill.style.width = `${progress}%`;
    elements.progressStats.textContent = `${appState.completedCount}/${appState.totalCount} 완료`;
    
    if (appState.isProcessing) {
        elements.progressText.textContent = '변환 중...';
    } else if (appState.completedCount === appState.totalCount && appState.totalCount > 0) {
        elements.progressText.textContent = '완료!';
    } else {
        elements.progressText.textContent = '대기 중...';
    }
}

/**
 * UI 상태 업데이트
 */
function updateUI() {
    const hasFiles = appState.files.length > 0;
    const isProcessing = appState.isProcessing;
    const hasCompleted = appState.completedCount > 0;
    
    // 버튼 상태
    elements.startBtn.disabled = !hasFiles || isProcessing;
    elements.pauseBtn.disabled = !isProcessing;
    elements.stopBtn.disabled = !isProcessing;
    elements.openFolderBtn.disabled = !hasCompleted;
    
    // 일시정지 버튼 텍스트
    if (appState.isPaused) {
        elements.pauseBtn.innerHTML = '▶️ 재개';
    } else {
        elements.pauseBtn.innerHTML = '⏸️ 일시정지';
    }
    
    updateOverallProgress();
}

/**
 * 상태 메시지 업데이트
 */
function updateStatus(message) {
    elements.statusText.textContent = message;
}

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', initialize);

console.log('ConvertWemp GUI 렌더러 로드됨'); 