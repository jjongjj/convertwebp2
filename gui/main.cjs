/**
 * ConvertWemp GUI - Electron 메인 프로세스
 * GIF to WebP 변환기의 데스크톱 GUI 애플리케이션
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');

// 메인 윈도우 참조
let mainWindow;

/**
 * 메인 윈도우 생성
 */
function createMainWindow() {
  const preloadPath = path.resolve(__dirname, 'preload.cjs');
  console.log('Preload 파일 경로:', preloadPath);
  console.log('Preload 파일 존재 여부:', fs.existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
      // preload: preloadPath // 임시로 비활성화
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'ConvertWemp - GIF to WebP Converter',
    show: false // 준비되면 표시
  });

  // HTML 파일 로드
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 준비되면 윈도우 표시
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 개발 중에는 DevTools 자동 열기
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  });

  // 윈도우 닫힐 때 정리
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 앱 이벤트 핸들러
 */

// 앱 준비 완료
app.whenReady().then(() => {
  createMainWindow();

  // macOS에서 dock 아이콘 클릭 시 윈도우 재생성
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// 모든 윈도우 닫힐 때 (macOS 제외)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC 이벤트 핸들러 (렌더러와의 통신)
 */

// 파일 선택 대화상자
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'GIF Images', extensions: ['gif'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  return result.filePaths;
});

// 출력 폴더 선택 대화상자
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  return result.filePaths[0];
});

// 결과 폴더 열기
ipcMain.handle('open-folder', async (event, folderPath) => {
  const { shell } = require('electron');
  await shell.openPath(folderPath);
});

// GIF 변환 요청
ipcMain.handle('convert-files', async (event, files, options) => {
  try {
    // 메인 프로세스에서 변환 로직 실행 (ES 모듈 동적 import 사용)
    const { convertGifToWebp } = await import('../src/converter.js');
    const { BatchProcessor } = await import('../src/batch-processor.js');
    
    const results = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // 진행상황 업데이트
        event.sender.send('conversion-progress', {
          fileIndex: i,
          fileName: path.basename(file),
          status: 'processing'
        });
        
        // 출력 경로 생성
        const outputPath = file.replace(/\.gif$/i, '.webp');
        
        // 변환 실행
        const result = await convertGifToWebp(file, outputPath, options);
        
        results.push({
          success: true,
          inputPath: file,
          outputPath,
          ...result
        });
        
        // 완료 알림
        event.sender.send('conversion-progress', {
          fileIndex: i,
          fileName: path.basename(file),
          status: 'completed',
          result
        });
        
      } catch (error) {
        results.push({
          success: false,
          inputPath: file,
          error: error.message
        });
        
        // 에러 알림
        event.sender.send('conversion-progress', {
          fileIndex: i,
          fileName: path.basename(file),
          status: 'error',
          error: error.message
        });
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('변환 중 오류:', error);
    throw error;
  }
});

// 앱 정보 가져오기
ipcMain.handle('get-app-info', () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node
  };
});

console.log('ConvertWemp GUI 시작됨'); 