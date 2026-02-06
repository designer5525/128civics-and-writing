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
const OfficialScreen = document.getElementById('official-screen');

// --- FUNCTIONS ---

// ✅ FIXED: Get best English voice - moved to top level
function getBestVoice() {
    const voices = synth.getVoices();
    
    // Filter out non-English voices first (crucial for Chrome on iPad with Chinese system)
    const englishVoices = voices.filter(v => 
        v.lang && v.lang.startsWith('en')
    );
    
    // If we have English voices, use them. Otherwise fallback to all voices.
    const voicePool = englishVoices.length > 0 ? englishVoices : voices;
    
    // Priority: 1. Samantha (iOS) | 2. Google US | 3. Any enhanced en-US | 4. Any en-US
    return voicePool.find(v => v.name.includes('Samantha')) || 
           voicePool.find(v => v.name.includes('Google US English')) ||
           voicePool.find(v => v.lang === 'en-US' && v.name.includes('Enhanced')) ||
           voicePool.find(v => v.lang && v.lang.startsWith('en-US')) ||
           voicePool[0];
}

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

// ✅ FIXED: Added delay for iOS voice loading
window.addEventListener('DOMContentLoaded', async () => {
    await Data();
    
    // Give iOS/iPad time to load voices
    setTimeout(() => {
        window.speechSynthesis.getVoices();
    }, 100);
    
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

// 4. 載入題目
function loadQuizQuestion() {
    if (currentIndex >= questionQueue.length) {
        alert("測試完成！");
        exitQuizMode();
        return;
    }

    // 重置卡片
    document.getElementById('quiz-q-hidden').classList.remove('hidden');
    document.getElementById('quiz-q-text').classList.add('hidden');
    document.getElementById('quiz-q-text').innerHTML = "";
    
    // 刷新圓點
    renderDots();
    updateAccuracy();
    
    // 更新進度
    document.getElementById('quiz-q-current').innerText = currentIndex + 1;
    document.getElementById('quiz-q-total').innerText = questionQueue.length;
    
    // 自動播放語音
    audioTimeout = setTimeout(() => playCurrentAudio(), 500);
}

// 5. 翻卡片顯示內容
function toggleQuizCard() {
    const hidden = document.getElementById('quiz-q-hidden');
    const textBox = document.getElementById('quiz-q-text');
    
    if (hidden.classList.contains('hidden')) {
        // 已翻開 → 關閉
        hidden.classList.remove('hidden');
        textBox.classList.add('hidden');
        document.getElementById('quiz-judge-group').classList.remove('show');
    } else {
        // 未翻開 → 顯示
        hidden.classList.add('hidden');
        textBox.classList.remove('hidden');
        
        const item = questionQueue[currentIndex];
        
        // --- 核心修正：統一提取英文部分 ---
        const englishText = (typeof item === 'object') ? item.word : item;
        const chineseText = (typeof item === 'object' && item.chinese) ? item.chinese : '';
        
        // 顯示內容 (英文 + 中文)
        textBox.innerHTML = chineseText 
            ? `<b>${englishText}</b><br><span style="font-size:14px;color:#666;">${chineseText}</span>`
            : `<b>${englishText}</b>`;
        
        // 顯示對錯按鈕 (僅當尚未作答時)
        if (quizResults[currentIndex] === null) {
            document.getElementById('quiz-judge-group').classList.add('show');
        }
    }
}

// 6. 記錄正確/錯誤
function markCorrect() {
    clearAudio();
    quizResults[currentIndex] = true;
    renderDots();
    updateAccuracy();
    document.getElementById('quiz-judge-group').classList.remove('show');
}
function markWrong() {
    clearAudio();
    quizResults[currentIndex] = false;
    renderDots();
    updateAccuracy();
    document.getElementById('quiz-judge-group').classList.remove('show');
}

// 7. 重聽
function replayQuizAudio() {
    clearAudio();
    playCurrentAudio();
}

// 8. 更新正確率
function updateAccuracy() {
    const answered = quizResults.filter(r => r !== null).length;
    const correct = quizResults.filter(r => r === true).length;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    
    document.getElementById('quiz-answered').innerText = answered;
    document.getElementById('quiz-total-q').innerText = questionQueue.length;
    document.getElementById('quiz-accuracy').innerText = accuracy;
}

// 9. 點擊圓點跳轉
function jumpToQuestion(index) {
    clearAudio();
    currentIndex = index;
    loadQuizQuestion();
}

// 10. 退出測試
function exitQuizMode() {
    clearAudio();
    document.getElementById('quiz-screen').classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

//練習模塊//

// 開始練習
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

// 重新開始練習
function restartSession() {
    clearAudio();
    if (currentMode === 'glossary') {
        startSession(currentMode, glossaryCategory);
    } else {
        startSession(currentMode);
    }
}

// 離開練習
function exitPractice() {
    clearAudio();
    isSessionStarted = false;
    const mainBtn = document.getElementById('main-btn');
    if (mainBtn) mainBtn.classList.add('colorful');
    
    practiceScreen.classList.add('hidden');
    if (currentMode === 'glossary') {
        glossaryMenuScreen.classList.remove('hidden');
    } else {
        homeScreen.classList.remove('hidden');
    }
}

// 清除語音和超時
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

// 主按鈕動作
function handleMainAction() {
    clearAudio();
    if (!isSessionStarted) {
        isSessionStarted = true;
        mainBtn.classList.remove('colorful');
        updateMainButtonText();
        audioTimeout = setTimeout(() => playCurrentAudio(), 500);
    } else {
        nextQuestion();
    }
}

// 取得當前項目
function getCurrentItem() {
    return questionQueue[currentIndex];
}

// 取得字串識別
function getQString(item) {
    return typeof item === 'string' ? item : item.word;
}

// 載入問題
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

// 切換問題卡片顯示
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
                        <button class="btn audio-sm-btn" onclick="event.stopPropagation(); speakText('${item.def.replace(/'/g, "\\'")}', false)">🔊</button>
                    </div>
                </div>`;
        } else {
            // --- 核心修正：統一從物件提取 word 屬性 ---
            const displayText = (typeof item === 'object') ? item.word : item;
            qText.innerText = displayText;
        }
    }
}

// 下一題
function nextQuestion() {
    currentIndex++;
    loadQuestion(true);
}

// 播放當前語音
function playCurrentAudio() {
    const item = getCurrentItem();
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

// ✅ FIXED: Text-to-speech with proper voice assignment
function speakText(text, showAnim = false) {
    synth.cancel();

    // Extract English part only
    const englishText = text.split(/[\u4e00-\u9fa5]/)[0].trim();
    const segments = englishText.split('|');
    let currentSegment = 0;

    function playNext() {
        if (currentSegment < segments.length) {
            const utterance = new SpeechSynthesisUtterance(segments[currentSegment].trim());
            
            // ✅ KEY FIX: Get and assign voice BEFORE setting other properties
            const selectedVoice = getBestVoice();
            utterance.voice = selectedVoice;
            utterance.lang = 'en-US';
            
            // ✅ CHROME iPAD FIX: Adjust rate based on voice to prevent slowdown
            // Chrome on iPad with Chinese system sometimes needs higher rate
            const isChromeLike = navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Safari');
            const needsRateBoost = isChromeLike && selectedVoice && !selectedVoice.lang.startsWith('en');
            utterance.rate = needsRateBoost ? 1.3 : 0.9;

            if (showAnim) {
                utterance.onstart = () => setAnimation(true);
            }

            utterance.onend = () => {
                currentSegment++;
                if (currentSegment < segments.length) {
                    if (showAnim) setAnimation(false);
                    setTimeout(playNext, 2000);
                } else {
                    if (showAnim) setAnimation(false);
                }
            };

            utterance.onerror = () => {
                if (showAnim) setAnimation(false);
            };

            synth.speak(utterance);
        }
    }

    playNext();
}

// ✅ FIXED: Glossary phrase speech with proper voice assignment
function speakGlossaryPhrase(word) {
    clearAudio();
    setAnimation(true);

    const bestVoice = getBestVoice(); // Get voice once
    
    // ✅ CHROME iPAD FIX: Detect if we need rate boost
    const isChromeLike = navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Safari');
    const needsRateBoost = isChromeLike && bestVoice && !bestVoice.lang.startsWith('en');
    const rate = needsRateBoost ? 1.2 : 0.85;
    const wordRate = needsRateBoost ? 1.0 : 0.75;
    
    const u1 = new SpeechSynthesisUtterance("What does");
    u1.voice = bestVoice; // ✅ Set voice first
    u1.lang = 'en-US';
    u1.rate = rate;

    const u2 = new SpeechSynthesisUtterance(word);
    u2.voice = bestVoice; // ✅ Set voice first
    u2.lang = 'en-US';
    u2.rate = wordRate;

    const u3 = new SpeechSynthesisUtterance("mean?");
    u3.voice = bestVoice; // ✅ Set voice first
    u3.lang = 'en-US';
    u3.rate = rate;

    u1.onend = () => audioSequenceTimeouts.push(setTimeout(() => synth.speak(u2), 200));
    u2.onend = () => audioSequenceTimeouts.push(setTimeout(() => synth.speak(u3), 200));
    u3.onend = () => setAnimation(false);
    u1.onerror = u2.onerror = u3.onerror = () => setAnimation(false);

    synth.speak(u1);
}

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

// 官網頁面

function showOfficialScreen() {
    homeScreen.classList.add('hidden');
    OfficialScreen.classList.remove('hidden');
}
function exitOfficialScreen() {
    OfficialScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
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

// ✅ 新增：在閱讀列表中點擊星號時的收藏/取消收藏
function toggleReadingBookmark(word) {
    const list = bookmarks.glossary;
    const idx = list.findIndex(item => {
        const itemText = (typeof item === 'object') ? item.word : item;
        return itemText === word;
    });

    if (idx > -1) {
        list.splice(idx, 1);
    } else {
        list.push(word);
    }

    saveBookmarks();
    renderReadingList();
}
