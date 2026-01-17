// --- STATE ---
let personalQuestions = [];
let part9Questions = [];
let glossaryData = [];
let quizResults = [];

let currentMode = '';
let glossaryCategory = 0;
let questionQueue = [];
let currentIndex = 0;
let isRevealed = false;
let isSessionStarted = false;
let bookmarks = JSON.parse(localStorage.getItem('n400_bookmarks_v2')) || { personal: [], part9: [], glossary: [] };
let currentTab = 'personal';
let synth = window.speechSynthesis;
let currentVoice = null;
let audioTimeout = null;
let audioSequenceTimeouts = [];

// --- DOM ELEMENTS ---
const homeScreen = document.getElementById('home-screen');
const glossaryMenuScreen = document.getElementById('glossary-menu-screen');
const practiceScreen = document.getElementById('practice-screen');
const bookmarkScreen = document.getElementById('bookmark-screen');
const audioAnim = document.getElementById('audio-anim');
const qBox = document.getElementById('q-box');
const qHidden = document.getElementById('q-hidden');
const qText = document.getElementById('q-text');
const qCounter = document.getElementById('q-current');
const qTotal = document.getElementById('q-total');
const starBtn = document.getElementById('btn-star');
const mainBtn = document.getElementById('main-btn');
// --- FUNCTIONS ---

// --- 新增：從 CSV 載入資料並關聯 ---
// --- 修改後的資料載入函數 ---
async function Data() {
    try {
        const response = await fetch('n400_data.csv?t=' + Date.now());
        const data = await response.text();
        const lines = data.split(/\r?\n/).filter(line => line.trim() !== "");

        // 重置數組
        personalQuestions = [];
        part9Questions = [];
        glossaryData = [];

        for (let i = 1; i < lines.length; i++) {
            const matches = lines[i].match(/(".*?"|[^,]+)/g);
            if (!matches) continue;

            const type = matches[0].trim().toLowerCase();
            const content = matches[1] ? matches[1].replace(/^"|"$/g, '').trim() : "";
            const trans = matches[2] ? matches[2].replace(/^"|"$/g, '').trim() : "";
            const extra = matches[3] ? matches[3].replace(/^"|"$/g, '').trim() : "";
            
            // 讀取第五欄位並轉為數字
            const catVal = matches[4] ? parseInt(matches[4].replace(/^"|"$/g, '').trim()) : 0;
            const trans2 = matches[5] ? matches[5].replace(/^"|"$/g, '').trim() : "";

            if (type === 'personal') {
                personalQuestions.push({
                    word: content,
                    chinese: trans,
                    def: extra,
                    chineseA: trans2,
                    phonetic: "", 
                    cat: catVal
                });
            } else if (type === 'part9') {
                part9Questions.push({
                 word: content,    // 存儲英文句子
               chinese: trans,   // 存儲中文翻譯
               cat: catVal       // 保留編號（選填）
       });
            } else if (type === 'glossary') {
                glossaryData.push({
                    word: content,
                    chinese: trans,
                    def: extra,
                    phonetic: "", 
                    cat: catVal
                });
            }
        }
        console.log("N400 題庫載入成功，名詞數量:", glossaryData.length);
    } catch (e) {
        console.error("載入 CSV 失敗:", e);
    }
}

// 確保執行時名稱一致
window.addEventListener('DOMContentLoaded', async () => {
    await Data(); 
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
});

// 小紅書跳轉
function goToXiaohongshu() {
    // 請將下方的網址替換為你複製的小紅書主頁連結
    const myRedBookUrl = "https://www.xiaohongshu.com/user/profile/631f3bfd00000000230254b1";
    
   // 判斷是否為電腦端 (如果寬度大於 1024px 通常是電腦)
    if (window.innerWidth > 1024) {
        // 電腦端：強制開啟新分頁，避免被原頁面攔截
        window.open(myRedBookUrl, "_blank");
    } else {
        // 手機端：保持現有的跳轉方式，這能呼起小紅書 App
        window.location.href = myRedBookUrl;
    }
}

// 洗牌
function shuffleArray(array) {
    let curId = array.length;
    while (0 !== curId) {
        let randId = Math.floor(Math.random() * curId);
        curId -= 1;
        [array[curId], array[randId]] = [array[randId], array[curId]]; 
    }
    return array;
}

// 切換 Glossary 菜單
function showGlossaryMenu() {
    homeScreen.classList.add('hidden');
    glossaryMenuScreen.classList.remove('hidden');
    renderReadingList(); // 進入時渲染列表
}

function renderReadingList() {
    const container = document.getElementById('reading-list-container');
    container.innerHTML = ""; 

    glossaryData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'reading-card';
        
        // 點擊卡片主體播放語音
        const safeWord = item.word.replace(/'/g, "\\'");
        card.onclick = () => speakText(safeWord, false);

        // 判斷目前是否已收藏，決定星星顏色
        const isBookmarked = bookmarks.glossary.some(b => 
            (typeof b === 'object' ? b.word : b) === item.word
        );
        const starIcon = isBookmarked ? "★" : "☆";
        const starClass = isBookmarked ? "bookmarked" : "";

        card.innerHTML = `
            <div class="reading-content">
                <div class="reading-en">${item.word}</div>
                <div class="reading-cn">${item.chinese}</div>
            </div>
            <div class="list-star ${starClass}" 
                 onclick="event.stopPropagation(); toggleReadingBookmark('${safeWord}')"
                 style="font-size: 24px; cursor: pointer; padding: 5px;">
                ${starIcon}
            </div>
        `;
        
        container.appendChild(card);
    });
}
function exitGlossaryMenu() {
    glossaryMenuScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

//測試模塊//

// 1. 初始化測試
// 修改啟動函數讓其可以識別題庫
function startQuizMode(mode) {
    currentMode = mode;
    
    // 根據模式選擇題庫
    let rawData = [];
    if (mode === 'personal') {
        rawData = [...personalQuestions]; // 128題
    } else if (mode === 'part9') {
        rawData = [...part9Questions];    // 聽寫題
    }

    // 洗牌並初始化
    questionQueue = shuffleArray(rawData);
    currentIndex = 0;
    isSessionStarted = false;
    quizResults = new Array(questionQueue.length).fill(null); 

    // 切換屏幕
    homeScreen.classList.add('hidden');
    // 如果有分類菜單也要隱藏 (例如從閱讀模塊進入時)
    if (glossaryMenuScreen) glossaryMenuScreen.classList.add('hidden'); 
    
    document.getElementById('quiz-screen').classList.remove('hidden');
    
    // 初始化按鈕樣式
    const mainBtn = document.getElementById('quiz-main-btn');
    mainBtn.innerText = "開始測試";
    mainBtn.classList.remove('next-mode');
    
    // 隱藏判斷按鈕
    document.getElementById('quiz-judge-group').classList.remove('show');
    
    // 重置卡片
    document.getElementById('quiz-q-hidden').classList.remove('hidden');
    document.getElementById('quiz-q-text').classList.add('hidden');

    renderDots(); // 生成上方圓點
    updateAccuracy(); // 重置正確率顯示
}

// 2. 生成/刷新圓點
function renderDots() {
    const container = document.getElementById('quiz-dots-container');
    container.innerHTML = "";
    quizResults.forEach((res, idx) => {
        const dot = document.createElement('div');
        dot.className = 'dot';
        if (idx === currentIndex) dot.classList.add('current');
        if (res === true) dot.classList.add('correct');
        if (res === false) dot.classList.add('wrong');
        
        // 點擊圓點跳轉
        dot.onclick = () => jumpToQuestion(idx);
        container.appendChild(dot);
    });
}

// 3. 處理主按鈕 (開始/下一題)
function handleQuizMainAction() {
    clearAudio();
    const mainBtn = document.getElementById('quiz-main-btn');
    
    if (!isSessionStarted) {
        // --- 情況 A: 首次點擊「開始測試」 ---
        isSessionStarted = true;
        
        // 切換按鈕樣式為「下一題」(深色)
        mainBtn.innerText = "下一題";
        mainBtn.classList.add('next-mode');
        
        loadQuizQuestion(); // 加載第一題
    } else {
        // --- 情況 B: 已經在測試中，點擊「下一題」 ---
        // 如果當前是翻開狀態，先收起對錯按鈕
        document.getElementById('quiz-judge-group').classList.remove('show');
        
        // 進入下一題
        currentIndex++;
        if (currentIndex >= questionQueue.length) {
            alert("測試完成！");
            exitQuizMode();
            return;
        }
        loadQuizQuestion();
    }
}
// 4. 判斷對錯
function handleQuizJudge(isCorrect) {
    quizResults[currentIndex] = isCorrect; // 紀錄結果
    updateAccuracy();
    renderDots(); // 更新圓點顏色
    handleQuizMainAction(); // 自動跳下一題
}

// 5. 更新正確率文字
function updateAccuracy() {
    const answered = quizResults.filter(r => r !== null).length;
    const correct = quizResults.filter(r => r === true).length;
    const rate = answered === 0 ? 100 : Math.round((correct / answered) * 100);
    document.getElementById('quiz-accuracy').innerText = `正確率: ${rate}% (${correct}/${answered})`;
}

// 6. 跳轉題目
function jumpToQuestion(idx) {
    // 如果還沒按「開始測試」，不允許通過圓點跳轉（或者點擊後自動視為開始）
    if (!isSessionStarted) {
        handleQuizMainAction(); 
    }
    currentIndex = idx;
    loadQuizQuestion();
}

function loadQuizQuestion() {
    isRevealed = false;
    // 更新標題和計數
    document.getElementById('quiz-q-title').innerText = `第 ${currentIndex + 1} 題`;
    
    // 重置卡片為背面
    document.getElementById('quiz-q-hidden').classList.remove('hidden');
    document.getElementById('quiz-q-text').classList.add('hidden');
    
    // 隱藏對錯按鈕（等待再次點擊卡片）
    document.getElementById('quiz-judge-group').classList.remove('show');
    
    renderDots(); // 更新圓點的高亮位置（黑邊）
    playCurrentQuizAudio(); // 自動播放語音
}

function toggleQuizCard() {
    if (!isSessionStarted || isRevealed) return;
    isRevealed = true;
    document.getElementById('quiz-q-hidden').classList.add('hidden');
    const qText = document.getElementById('quiz-q-text');
    qText.classList.remove('hidden');
    
    // 渲染卡片內容 (這裡調用你原本 app.js 裡的渲染邏輯，只是改個 ID)
    const item = questionQueue[currentIndex];

  // --- 根據模式選擇渲染樣式 ---
    if (currentMode === 'part9') {
        // 聽寫模式 (Writing)：居中、大字體、簡潔樣式
        qText.innerHTML = `
            <div style="
                display: flex; 
                flex-direction: column; 
                justify-content: center; 
                align-items: center; 
                height: 100%; 
                min-height: 160px;
                text-align: center;
                padding: 10px;
            ">
                <div style="font-size: 30px; font-weight: bold; color: #000; margin-bottom: 15px; line-height: 1.2;">
                    ${item.word}
                </div>
                <div style="font-size: 18px; color: #666;">
                    ${item.chinese}
                </div>
            </div>`;
    } else {
        // 128題模式 (Personal)：原本的精美左對齊樣式
        qText.innerHTML = `
            <div style="text-align: left; padding: 10px; width: 100%;">
                <div style="margin-bottom: 20px;">
                    <div style="margin-bottom: 8px; white-space: nowrap; display: flex; align-items: baseline; gap: 6px;">
                        <span style="font-size: 20px; font-weight: 800; color: #000;">#${item.cat || "0"}</span>
                        <span style="font-size: 10px; color: #8E8E93; font-weight: bold; letter-spacing: 1px;">問題 QUESTION</span>
                    </div>
                    <div style="font-size: 17px; font-weight: bold; color: #000; line-height: 1.3;">${item.word}</div>
                    <div style="font-size: 14px; color: #666; margin-top: 4px;">${item.chinese}</div>
                </div>

                <div style="border-top: 1px dashed #E5E5EA; margin: 15px 0;"></div>

                <div style="margin-top: 15px;">
                    <div style="font-size: 10px; color: #8E8E93; margin-bottom: 4px; font-weight: bold; letter-spacing: 1px;">答案 ANSWER</div>
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <div style="flex: 1;">
                            <div style="font-size: 16px; font-weight: bold; color: #007AFF; line-height: 1.3;">${item.def || ""}</div>
                            <div style="font-size: 14px; color: #007AFF; margin-top: 4px; opacity: 0.8;">${item.chineseA || ""}</div>
                        </div>
                        ${item.def ? `
                            <button class="btn" style="background: #F2F2F7; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center;" 
                                    onclick="event.stopPropagation(); speakText('${item.def.replace(/'/g, "\\'")}')">
                                <span style="font-size: 14px;">🔊</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // 顯示「對/錯」判斷按鈕組 (這會自動擠壓下方的「下一題」按鈕)
    document.getElementById('quiz-judge-group').classList.add('show');
}

function exitQuizMode() {
    document.getElementById('quiz-screen').classList.add('hidden');
    homeScreen.classList.remove('hidden');
    isSessionStarted = false;
    clearAudio();
}

// 播放測試分頁當前的題目語音
function playCurrentQuizAudio() {
    const item = questionQueue[currentIndex];
    if (item) {
        speakText(item.word, true); // 測試模式通常需要動畫回饋
    }
}

// 點擊測試分頁考官頭像重聽
function replayQuizAudio() {
    clearAudio();
    playCurrentQuizAudio();
}

//重來當前測試
function restartQuizSession() {
    // 1. 彈出確認視窗（選配，防止誤觸）
    if (!confirm("確定要重新開始測試嗎？所有進度將清空。")) return;

    // 2. 停止語音
    clearAudio();

    // 3. 重置邏輯狀態
    currentIndex = 0;
    isRevealed = false;
    isSessionStarted = false; // 回到還沒按「開始」的狀態
    
    // 4. 清空答題紀錄 (重置所有圓點為 null)
    quizResults = new Array(questionQueue.length).fill(null);

    // 5. 重置 UI 元素
    const mainBtn = document.getElementById('quiz-main-btn');
    mainBtn.innerText = "開始測試";
    mainBtn.classList.remove('next-mode'); // 變回藍色
    
    document.getElementById('quiz-judge-group').classList.remove('show');
    document.getElementById('quiz-q-hidden').classList.remove('hidden');
    document.getElementById('quiz-q-text').classList.add('hidden');
    
    // 6. 重新刷新圓點顯示和正確率
    renderDots();
    updateAccuracy();
    
    // 7. 更新題目編號顯示
    document.getElementById('quiz-q-title').innerText = `第 1 題`;
}
//退出測試//
function exitQuizMode() {
    clearAudio();
    document.getElementById('quiz-screen').classList.add('hidden');
    
    // 無論從哪裡進入，退出後一律回主頁是最安全的
    homeScreen.classList.remove('hidden');
    
    isSessionStarted = false;
}


//閱讀模塊語音
function speakGlossaryPhrase(word) {
    // 閱讀模塊現在直接讀句子即可
    speakText(word, false);
}

//閱讀模塊收藏邏輯
function toggleReadingBookmark(wordText) {
    const list = bookmarks.glossary;
    // 尋找是否已存在
    const idx = list.findIndex(b => (typeof b === 'object' ? b.word : b) === wordText);

    if (idx > -1) {
        // 已存在則移除
        list.splice(idx, 1);
    } else {
        // 不存在則從 glossaryData 找回完整物件存入
        const item = glossaryData.find(g => g.word === wordText);
        if (item) list.push(item);
    }

    saveBookmarks();
    renderReadingList(); // 立即刷新列表顯示星星狀態
}

// 啟動練習
function startSession(mode, catId = 0) {
  if (personalQuestions.length === 0) {
        console.log("數據尚未就緒，嘗試重新載入...");
        return; 
    }
    currentMode = mode;
    glossaryCategory = catId;
    let pool = [];

    if (mode === 'personal') {
        pool = [...personalQuestions];
        questionQueue = shuffleArray(pool);
    } else if (mode === 'part9') {
        pool = [...part9Questions];
        questionQueue = shuffleArray(pool);
    } else if (mode === 'glossary') {
        pool = glossaryData.filter(item => item.cat === catId);
        if (pool.length === 0 && glossaryData.length > 0) {
            console.warn(`分類 ID ${catId} 中沒有資料，請檢查 CSV`);
            // 備選方案：如果分類找不到，顯示全部名詞
            pool = [...glossaryData]; 
        }
        questionQueue = shuffleArray(pool);
    }

    if (questionQueue.length === 0) {
        alert("目前清單是空的喔！");
        return;
    }
    currentIndex = 0;
    isSessionStarted = false;

    homeScreen.classList.add('hidden');
    glossaryMenuScreen.classList.add('hidden');
    practiceScreen.classList.remove('hidden');

    updateMainButtonText();
    loadQuestion(false);
}

// 重新開始
function restartSession() {
    clearAudio();
    if (currentMode === 'glossary') {
        startSession(currentMode, glossaryCategory);
    } else {
        startSession(currentMode);
    }
}

// 退出練習
function exitPractice() {
    clearAudio();
  // 1. 重置狀態變數，讓下次進入時能判定為「尚未開始」
    isSessionStarted = false;
  // 2. 恢復按鈕的藍色樣式類名
    const mainBtn = document.getElementById('main-btn');
    if (mainBtn) mainBtn.classList.add('colorful');
    
  practiceScreen.classList.add('hidden');
    if (currentMode === 'glossary') {
        glossaryMenuScreen.classList.remove('hidden');
    } else {
        homeScreen.classList.remove('hidden');
    }
}

// 清除語音動畫與時間軸
function clearAudio() {
    synth.cancel();
    if (audioTimeout) clearTimeout(audioTimeout);
    audioSequenceTimeouts.forEach(t => clearTimeout(t));
    audioSequenceTimeouts = [];
    setAnimation(false);
}

// 更新主按鈕文字
function updateMainButtonText() {
    mainBtn.innerHTML = isSessionStarted ? "我回答<br>完了" : "開始<br>面試";
}

// 主按鈕行為
function handleMainAction() {
    clearAudio();
    if (!isSessionStarted) {
        isSessionStarted = true;
        // --- 點擊後移除藍色類名 ---
        mainBtn.classList.remove('colorful');
      
        updateMainButtonText();
        audioTimeout = setTimeout(() => playCurrentAudio(), 500);
    } else {
        nextQuestion();
    }
}

// 取得當前題目
function getCurrentItem() {
    return questionQueue[currentIndex];
}

// 取得字串識別
function getQString(item) {
    return typeof item === 'string' ? item : item.word;
}

// 載入題目
function loadQuestion(autoPlay) {
    if (currentIndex >= questionQueue.length) {
        alert("練習完成！即將返回主頁。");
        exitPractice();
        return;
    }

    isRevealed = false;
    qHidden.classList.remove('hidden');
    qText.classList.add('hidden');
    qText.innerHTML = "";

    qCounter.innerText = currentIndex + 1;
    qTotal.innerText = questionQueue.length;

    updateBookmarkButtonState();

    if (autoPlay) audioTimeout = setTimeout(() => playCurrentAudio(), 500);
}

// 顯示 / 隱藏題目卡
function toggleQuestionCard() {
    if (isRevealed) {
        isRevealed = false;
        qHidden.classList.remove('hidden');
        qText.classList.add('hidden');
    } else {
        isRevealed = true;
        qHidden.classList.add('hidden');
        qText.classList.remove('hidden');

        const item = getCurrentItem();  

        if (currentMode === 'glossary') {
            qText.innerHTML = `
                <div class="gloss-content">
                    <div class="gloss-word">${item.word}</div>
                    <div class="gloss-phonetic">${item.phonetic}</div>
                    <div class="gloss-cn">${item.chinese}</div>
                    <div class="gloss-divider"></div>
                    <div class="gloss-def-container">
                        <div class="gloss-def">${item.def}</div>
                        <button class="btn audio-sm-btn" onclick="event.stopPropagation(); speakText('${item.def.replace(/'/g, "\\'")}')">🔊</button>
                    </div>
                </div>`;
       } else if (currentMode === 'personal') {
    const item = getCurrentItem(); 
    qText.innerHTML = `
        <div style="text-align: left; padding: 10px; width: 100%;">
            <div style="margin-bottom: 20px;">
                <div style="margin-bottom: 8px; white-space: nowrap; display: flex; align-items: baseline; gap: 6px;">
                    <span style="font-size: 22px; font-weight: 800; color: #000;">#${item.cat || "0"}</span>
                    <span style="font-size: 11px; color: #8E8E93; font-weight: bold; letter-spacing: 1px;">問題 QUESTION</span>
                </div>
                <div style="font-size: 18px; font-weight: bold; color: #000; line-height: 1.3;">${item.word}</div>
                <div style="font-size: 15px; color: #666; margin-top: 4px;">${item.chinese}</div>
            </div>

            <div style="border-top: 1px dashed #E5E5EA; margin: 20px 0;"></div>

            <div style="margin-top: 20px;">
                <div style="font-size: 11px; color: #8E8E93; margin-bottom: 4px; font-weight: bold; letter-spacing: 1px;">答案 ANSWER</div>
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <div style="flex: 1;">
                        <div style="font-size: 17px; font-weight: bold; color: #007AFF; line-height: 1.3;">${item.def || ""}</div>
                        <div style="font-size: 15px; color: #007AFF; margin-top: 4px; opacity: 0.8;">${item.chineseA || ""}</div>
                    </div>
                    ${item.def ? `
                        <button class="btn" style="background: #F2F2F7; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center;" 
                                onclick="event.stopPropagation(); speakText('${item.def.replace(/'/g, "\\'")}')">
                            <span style="font-size: 14px;">🔊</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>`;
        } else if (currentMode === 'part9') {
            // --- 這裡修正顯示物件內容 ---
            qText.innerHTML = `
                <div style="
                    display: flex; 
                    flex-direction: column; 
                    justify-content: center; 
                    align-items: center; 
                    height: 100%; 
                    text-align: center;
                ">
                    <div style="font-size: 32px; font-weight: bold; color: #000; margin-bottom: 20px;">
                        ${item.word}
                    </div>
                    <div style="font-size: 20px; color: #666;">
                        ${item.chinese}
                    </div>
                </div>`;
        }
    }
}

// 下一題
function nextQuestion() {
    currentIndex++;
    loadQuestion(true);
}

// 播放當前題目語音
function playCurrentAudio() {
    const item = getCurrentItem();
    if (!item) return;

    if (currentMode === 'glossary') {
        speakGlossaryPhrase(item.word);
    } else if (currentMode === 'personal') {
        speakText(item.word, true); // 個人問題通常是物件
    } else if (currentMode === 'part9') {
        // --- 核心修正：從物件中提取英文單字 ---
        speakText(item.word, true); 
    } else {
        // 備用邏輯
        const textToSpeak = typeof item === 'string' ? item : item.word;
        speakText(textToSpeak, true);
    }
}

// 重播
function replayAudio() {
    clearAudio();
    playCurrentAudio();
}

// 語音動畫控制
function setAnimation(isActive) {
    audioAnim.classList.toggle('playing', isActive);
}

// 語音朗讀

function speakText(text, showAnim = false) {
    // 先清理掉之前正在讀的內容
    synth.cancel();

    // 1. 只提取英文部分進行朗讀（避免語音引擎嘗試讀中文）
    const englishText = text.split(/[\u4e00-\u9fa5]/)[0].trim();

    // 2. 依照 "|" 符號拆分英文段落
    const segments = englishText.split('|');
    let currentSegment = 0;

    // 定義一個內部的播放函數來實現循環停頓
    function playNext() {
        if (currentSegment < segments.length) {
            const utterance = new SpeechSynthesisUtterance(segments[currentSegment].trim());
            utterance.lang = 'en-US';
            utterance.rate = 0.9;

            // 定義一個函數來選取最好的聲音
function getBestVoice() {
    let voices = synth.getVoices();
    
    // 優先順序：1. iPhone 的 Samantha | 2. Google 的高品質音 | 3. 任何 en-US 的聲音
    return voices.find(v => v.name.includes('Samantha')) || 
           voices.find(v => v.name.includes('Google US English')) ||
           voices.find(v => v.lang === 'en-US' && v.name.includes('Enhanced')) ||
           voices.find(v => v.lang.startsWith('en-US')) ||
           voices[0];
}

// 播放函數
function speak(text) {
    if (synth.speaking) { synth.cancel(); } // 如果正在說話，先停止

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 關鍵：每次播放前重新獲取一次最好的聲音，確保手機已加載完成
    utterance.voice = getBestVoice();
    
    // 參數調整
    utterance.rate = 0.85;  // 稍慢，適合練習
    utterance.pitch = 1.0;  // 音調正常
    
    synth.speak(utterance);
}

// 解決 Chrome/Safari 的異步加載問題
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = getBestVoice;
}

            // 動態效果控制
            if (showAnim) {
                utterance.onstart = () => setAnimation(true);
                // 注意：這裡不直接設為 false，改在 onend 判斷
            }

            // 當這一段讀完後的處理
            utterance.onend = () => {
                currentSegment++;
                if (currentSegment < segments.length) {
                    // 關鍵：如果還沒讀完，關閉動畫並等待 2 秒再讀下一段
                    if (showAnim) setAnimation(false); 
                    setTimeout(playNext, 2000); 
                } else {
                    // 全部讀完後，確保動畫關閉
                    if (showAnim) setAnimation(false);
                }
            };

            utterance.onerror = () => {
                if (showAnim) setAnimation(false);
            };

            synth.speak(utterance);
        }
    }

    // 開始執行第一段播放
    playNext();
}

/*
// Glossary 專用朗讀
function speakGlossaryPhrase(word) {
    clearAudio();
    setAnimation(true);

    const rate = 0.85;
    const u1 = new SpeechSynthesisUtterance("What does");
    u1.lang = 'en-US'; u1.rate = rate;
    const u2 = new SpeechSynthesisUtterance(word);
    u2.lang = 'en-US'; u2.rate = 0.75;
    const u3 = new SpeechSynthesisUtterance("mean?");
    u3.lang = 'en-US'; u3.rate = rate;

    u1.onend = () => audioSequenceTimeouts.push(setTimeout(() => synth.speak(u2), 200));
    u2.onend = () => audioSequenceTimeouts.push(setTimeout(() => synth.speak(u3), 200));
    u3.onend = () => setAnimation(false);
    u1.onerror = u2.onerror = u3.onerror = () => setAnimation(false);

    synth.speak(u1);
}
*/

// --- BOOKMARKS ---
function updateBookmarkButtonState() {
    const item = getCurrentItem();
    const val = getQString(item);
    const listKey = currentMode === 'glossary' ? 'glossary' : currentMode;
    const list = bookmarks[listKey];

    if (list.includes(val)) {
        starBtn.innerText = "★";
        starBtn.classList.add('bookmarked');
    } else {
        starBtn.innerText = "☆";
        starBtn.classList.remove('bookmarked');
    }
}

function toggleBookmark() {
    const item = getCurrentItem();
    const val = getQString(item);
    const listKey = currentMode === 'glossary' ? 'glossary' : currentMode;
    const list = bookmarks[listKey];
    const idx = list.indexOf(val);

    if (idx > -1) list.splice(idx, 1);
    else list.push(val);

    saveBookmarks();
    updateBookmarkButtonState();
}

function saveBookmarks() {
    localStorage.setItem('n400_bookmarks_v2', JSON.stringify(bookmarks));
}

// 書籤頁面
function showBookmarks() {
    homeScreen.classList.add('hidden');
    bookmarkScreen.classList.remove('hidden');
    switchTab('personal');
}
function exitBookmarks() {
    clearAudio();
    bookmarkScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-personal').classList.toggle('active', tab === 'personal');
    document.getElementById('tab-part9').classList.toggle('active', tab === 'part9');
    document.getElementById('tab-glossary').classList.toggle('active', tab === 'glossary');
    renderBookmarkList();
}

function renderBookmarkList() {
    const container = document.getElementById('bookmark-list');
    container.innerHTML = "";

    const list = bookmarks[currentTab];
    if (!list || list.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#999; margin-top:50px;">暫無收藏</div>`;
        return;
    }

    list.forEach(val => {
        const item = document.createElement('div');
        item.className = 'list-item';
        
        // --- 核心修正：統一提取英文句子 ---
        // 如果 val 是物件 (part9)，取 word；如果是字串 (personal)，就用 val 本身
        const textValue = (typeof val === 'object') ? val.word : val;
        
        // 為了讓刪除功能生效，這裡必須拿到原始的文字內容
        const safeValForDelete = textValue.replace(/'/g, "\\'");
        
        let displayText = textValue;
        let audioAction = `speakText('${textValue.replace(/'/g, "\\'")}', false)`;

        // 處理名詞解釋的原有邏輯
        if (currentTab === 'glossary') {
            const found = glossaryData.find(g => g.word === val);
            audioAction = `speakGlossaryPhrase('${textValue.replace(/'/g, "\\'")}')`;
            if (found) displayText = `<b>${found.word}</b><br><span style="font-size:14px;color:#666">${found.chinese}</span>`;
        } 
        // 處理 Part9 的顯示邏輯 (顯示英文+中文)
        else if (typeof val === 'object' && val.chinese) {
            displayText = `<b>${val.word}</b><br><span style="font-size:14px;color:#666">${val.chinese}</span>`;
        }

        item.innerHTML = `
            <button class="btn list-audio-btn" onclick="${audioAction}">🔊</button>
            <div class="list-text">${displayText}</div>
            <div class="list-remove" onclick="removeBookmarkFromList('${safeValForDelete}')">🗑️</div>
        `;
        container.appendChild(item);
    });
}

function removeBookmarkFromList(val) {
    const list = bookmarks[currentTab];
    
    // 使用 findIndex 來比對，無論存的是字串還是物件都能找到
    const idx = list.findIndex(item => {
        const itemText = (typeof item === 'object') ? item.word : item;
        return itemText === val;
    });

    if (idx > -1) {
        list.splice(idx, 1);
        saveBookmarks();
        renderBookmarkList();
        
        // 同步更新閱讀列表的星星狀態 (如果閱讀列表正開啟著)
        if (currentTab === 'glossary') {
            renderReadingList();
        }
    }
}