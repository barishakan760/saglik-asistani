// APP STATE
let state = {
    healthData: [],
    waterCount: 0,
    lastWaterDate: "",
    username: "Kullanıcı",
    geminiApiKey: "",
    passwordHash: ""
};

// SESSION STATE (IN-MEMORY ONLY)
let sessionState = {
    isLoggedIn: false
};

// CHART INSTANCES
let sugarChartInstance = null;
let bpChartInstance = null;
let activePeriod = 'daily'; // 'daily' | 'weekly' | 'monthly'
let activeHistoryFilter = 'all'; // 'all' | 'sugar' | 'pressure' | 'weight'

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    loadState();
    setupCurrentDate();
    prefillDateTime();
    updateDashboard();
    initTheme();
    
    // Switch to initial dashboard view
    switchPage('dashboard');
});

// INITIALIZE THEME
function initTheme() {
    const isDark = localStorage.getItem("theme") !== "light";
    if (!isDark) {
        document.body.classList.remove("dark-theme");
        document.body.classList.add("light-theme");
    }
    
    document.getElementById("themeToggle").addEventListener("click", () => {
        if (document.body.classList.contains("dark-theme")) {
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
            localStorage.setItem("theme", "light");
        } else {
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
            localStorage.setItem("theme", "dark");
        }
        // Re-render charts to adjust text color for theme
        if (document.getElementById("page-analysis").classList.contains("active")) {
            renderCharts();
        }
    });
}

// SETUP DATE HEADER
function setupCurrentDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date();
    document.getElementById("currentDateText").textContent = today.toLocaleDateString('tr-TR', options);
}

// PRE-FILL FORM DATES
function prefillDateTime() {
    const now = new Date();
    const localDate = now.toISOString().split('T')[0];
    const localTime = now.toTimeString().substring(0, 5);
    
    const dateInputs = ['sugar_date', 'bp_date', 'weight_date'];
    const timeInputs = ['sugar_time', 'bp_time', 'weight_time'];
    
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = localDate;
    });
    
    timeInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = localTime;
    });
}

// LOAD STATE FROM LOCALSTORAGE
function loadState() {
    const savedState = localStorage.getItem("saglik_asistani_state");
    if (savedState) {
        try {
            state = JSON.parse(savedState);
            if (!state.healthData) state.healthData = [];
            if (state.waterCount === undefined) state.waterCount = 0;
            if (!state.username) state.username = "Kullanıcı";
            if (!state.geminiApiKey) state.geminiApiKey = "";
            if (!state.passwordHash) state.passwordHash = "";
        } catch (e) {
            console.error("State loading error:", e);
        }
    }
    
    // Check if water tracker needs daily reset
    const todayStr = new Date().toISOString().split('T')[0];
    if (state.lastWaterDate !== todayStr) {
        state.waterCount = 0;
        state.lastWaterDate = todayStr;
        saveState();
    }
    
    document.getElementById("displayUsername").textContent = state.username;
    document.getElementById("usernameInput").value = state.username;
    
    const geminiInput = document.getElementById("geminiKeyInput");
    if (geminiInput) {
        geminiInput.value = state.geminiApiKey || "";
    }
    
    // Check authentication status
    checkAuthenticationStatus();
}

// SAVE STATE TO LOCALSTORAGE
function saveState() {
    localStorage.setItem("saglik_asistani_state", JSON.stringify(state));
}

// GEMINI API KEY ACTIONS
function saveGeminiKey() {
    const input = document.getElementById("geminiKeyInput");
    const key = input.value.trim();
    if (key) {
        state.geminiApiKey = key;
        saveState();
        showToast("Gemini API anahtarı kaydedildi.");
        sessionStorage.removeItem("cached_gemini_advice");
    } else {
        alert("Lütfen geçerli bir API anahtarı girin.");
    }
}

// REMOVE GEMINI API KEY
function removeGeminiKey() {
    if (confirm("Gemini API anahtarını silmek istediğinizden emin misiniz?")) {
        state.geminiApiKey = "";
        saveState();
        document.getElementById("geminiKeyInput").value = "";
        showToast("Gemini API anahtarı silindi.");
        sessionStorage.removeItem("cached_gemini_advice");
    }
}

// PASSWORD HASH FUNCTION (SHA-256)
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password + "saglik_salt_2026");
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// CHECK AUTHENTICATION STATUS
function checkAuthenticationStatus() {
    const overlay = document.getElementById("authOverlay");
    const registerForm = document.getElementById("registerForm");
    const loginForm = document.getElementById("loginForm");
    const subtitle = document.getElementById("authSubtitle");
    
    if (!overlay) return;
    
    if (!state.passwordHash || state.passwordHash === "") {
        // User not registered yet
        overlay.style.display = "flex";
        registerForm.style.display = "block";
        loginForm.style.display = "none";
        subtitle.textContent = "Sağlık verilerinizi telefonunuzda şifreli saklamak için bir parola oluşturun.";
    } else {
        // Registered
        if (sessionState.isLoggedIn) {
            overlay.style.display = "none";
        } else {
            overlay.style.display = "flex";
            registerForm.style.display = "none";
            loginForm.style.display = "block";
            subtitle.textContent = `Hoş geldiniz, ${state.username}. Devam etmek için şifrenizi girin.`;
        }
    }
}

// HANDLE REGISTRATION
async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById("regUsername").value.trim();
    const p1 = document.getElementById("regPassword").value;
    const p2 = document.getElementById("regPasswordConfirm").value;
    
    if (p1 !== p2) {
        alert("Şifreler eşleşmiyor, lütfen kontrol edin.");
        return;
    }
    
    if (p1.length < 4) {
        alert("Şifre en az 4 karakterden oluşmalıdır.");
        return;
    }
    
    state.username = username;
    state.passwordHash = await hashPassword(p1);
    saveState();
    
    sessionState.isLoggedIn = true;
    checkAuthenticationStatus();
    
    document.getElementById("displayUsername").textContent = username;
    document.getElementById("usernameInput").value = username;
    
    // Clear registration fields
    document.getElementById("regUsername").value = "";
    document.getElementById("regPassword").value = "";
    document.getElementById("regPasswordConfirm").value = "";
    
    showToast("Kayıt başarılı! Hoş geldiniz.");
    updateDashboard();
}

// HANDLE LOGIN
async function handleLogin(e) {
    e.preventDefault();
    const passwordInput = document.getElementById("loginPassword");
    const password = passwordInput.value;
    
    const inputHash = await hashPassword(password);
    
    if (inputHash === state.passwordHash) {
        sessionState.isLoggedIn = true;
        checkAuthenticationStatus();
        passwordInput.value = "";
        showToast("Giriş başarılı.");
        updateDashboard();
    } else {
        alert("Hatalı şifre! Lütfen tekrar deneyin.");
        passwordInput.value = "";
    }
}

// HANDLE LOGOUT
function handleLogout() {
    sessionState.isLoggedIn = false;
    checkAuthenticationStatus();
    showToast("Oturum kapatıldı.");
}

// RESET APPLICATION DATA (FORGOTTEN PASSWORD FALLBACK)
function forgotPassword() {
    const confirm1 = confirm("Şifrenizi sıfırlamak tüm verilerinizi KALICI OLARAK SİLECEKTİR! Verilerinizi kaybedeceksiniz. Devam etmek istiyor musunuz?");
    if (confirm1) {
        const confirm2 = confirm("SON UYARI: Bu işlem geri alınamaz. Tüm geçmiş tansiyon ve şeker ölçümleriniz silinecektir. Emin misiniz?");
        if (confirm2) {
            localStorage.removeItem("saglik_asistani_state");
            sessionStorage.clear();
            location.reload();
        }
    }
}

// TOGGLE PASSWORD VISIBILITY
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const toggleBtn = input.nextElementSibling;
    if (input.type === "password") {
        input.type = "text";
        toggleBtn.textContent = "🙈";
    } else {
        input.type = "password";
        toggleBtn.textContent = "👁️";
    }
}



// PAGE SWITCHER
function switchPage(pageId) {
    // Hide all pages
    const pages = document.querySelectorAll(".app-page");
    pages.forEach(p => p.classList.remove("active"));
    
    // Show selected page
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.add("active");
    }
    
    // Update navbar indicators (except for hidden detail views like history/apk-guide)
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => item.classList.remove("active"));
    
    const activeNavItem = document.getElementById(`nav-${pageId}`);
    if (activeNavItem) {
        activeNavItem.classList.add("active");
    }
    
    // Page-specific initializations
    if (pageId === 'dashboard') {
        updateDashboard();
    } else if (pageId === 'analysis') {
        renderCharts();
    } else if (pageId === 'advice') {
        generateAdviceReport();
    } else if (pageId === 'log') {
        prefillDateTime();
    } else if (pageId === 'history') {
        renderHistoryList();
    }
    
    // Scroll content view to top
    document.querySelector(".app-content").scrollTop = 0;
}

// SUB-TAB SWITCH FOR LOG PAGE
function switchLogTab(tabName) {
    const tabs = document.querySelectorAll(".log-tab-btn");
    tabs.forEach(t => t.classList.remove("active"));
    
    const activeTab = Array.from(tabs).find(t => t.textContent.toLowerCase().includes(tabName === 'sugar' ? 'şeker' : tabName === 'pressure' ? 'tansiyon' : 'kilo'));
    if (activeTab) activeTab.classList.add("active");
    
    const forms = document.querySelectorAll(".log-form");
    forms.forEach(f => f.classList.remove("active"));
    
    if (tabName === 'sugar') document.getElementById("sugarForm").classList.add("active");
    if (tabName === 'pressure') document.getElementById("pressureForm").classList.add("active");
    if (tabName === 'weight') document.getElementById("weightForm").classList.add("active");
}

// SHOW TOAST MESSAGE
function showToast(message) {
    const toast = document.getElementById("toastNotification");
    const toastText = document.getElementById("toastMessage");
    toastText.textContent = message;
    toast.classList.add("show");
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

// SAVE SUGAR RECORD
function saveSugar(e) {
    e.preventDefault();
    const form = document.getElementById("sugarForm");
    const type = form.elements['sugar_type'].value; // 'fasting' | 'postprandial'
    const value = parseInt(document.getElementById("sugar_value").value);
    const date = document.getElementById("sugar_date").value;
    const time = document.getElementById("sugar_time").value;
    const notes = document.getElementById("sugar_notes").value;
    
    const record = {
        id: "sugar_" + Date.now(),
        type: "sugar",
        value: value,
        date: date,
        time: time,
        timestamp: new Date(`${date}T${time}`).toISOString(),
        notes: notes,
        metadata: {
            sugarType: type // 'fasting' (Açlık) or 'postprandial' (Tokluk)
        }
    };
    
    state.healthData.push(record);
    saveState();
    form.reset();
    prefillDateTime();
    showToast("Kan şekeri kaydı başarıyla eklendi.");
    switchPage('dashboard');
}

// SAVE BLOOD PRESSURE RECORD
function savePressure(e) {
    e.preventDefault();
    const form = document.getElementById("pressureForm");
    const systolic = parseInt(document.getElementById("bp_systolic").value);
    const diastolic = parseInt(document.getElementById("bp_diastolic").value);
    const pulse = parseInt(document.getElementById("bp_pulse").value);
    const date = document.getElementById("bp_date").value;
    const time = document.getElementById("bp_time").value;
    const notes = document.getElementById("bp_notes").value;
    
    const record = {
        id: "bp_" + Date.now(),
        type: "pressure",
        value: {
            systolic: systolic,
            diastolic: diastolic,
            pulse: pulse
        },
        date: date,
        time: time,
        timestamp: new Date(`${date}T${time}`).toISOString(),
        notes: notes
    };
    
    state.healthData.push(record);
    saveState();
    form.reset();
    prefillDateTime();
    showToast("Tansiyon kaydı başarıyla eklendi.");
    switchPage('dashboard');
}

// SAVE WEIGHT RECORD
function saveWeight(e) {
    e.preventDefault();
    const form = document.getElementById("weightForm");
    const value = parseFloat(document.getElementById("weight_value").value);
    const date = document.getElementById("weight_date").value;
    const time = document.getElementById("weight_time").value;
    const notes = document.getElementById("weight_notes").value;
    
    const record = {
        id: "weight_" + Date.now(),
        type: "weight",
        value: value,
        date: date,
        time: time,
        timestamp: new Date(`${date}T${time}`).toISOString(),
        notes: notes
    };
    
    state.healthData.push(record);
    saveState();
    form.reset();
    prefillDateTime();
    showToast("Kilo kaydı başarıyla eklendi.");
    switchPage('dashboard');
}

// DELETE A RECORD
function deleteRecord(id) {
    if (confirm("Bu kaydı silmek istediğinizden emin misiniz?")) {
        state.healthData = state.healthData.filter(item => item.id !== id);
        saveState();
        showToast("Kayıt başarıyla silindi.");
        
        // Refresh active views
        if (document.getElementById("page-history").classList.contains("active")) {
            renderHistoryList();
        } else {
            updateDashboard();
        }
    }
}

// WATER TRACKER ACTIONS
function addWater(amount) {
    state.waterCount += amount;
    saveState();
    updateWaterUI();
    showToast(`${amount} ml su kaydedildi. Şifa olsun!`);
}

function resetWater() {
    if (confirm("Günlük su tüketim sayacını sıfırlamak istiyor musunuz?")) {
        state.waterCount = 0;
        saveState();
        updateWaterUI();
    }
}

function updateWaterUI() {
    const progressPercent = Math.min((state.waterCount / 2500) * 100, 100);
    document.getElementById("waterCounter").textContent = `${state.waterCount} / 2500 ml`;
    document.getElementById("waterProgress").style.width = `${progressPercent}%`;
}

// INTERPRET BLOOD PRESSURE
function interpretBloodPressure(systolic, diastolic) {
    if (systolic > 180 || diastolic > 120) {
        return { label: "Kriz Derecesi", status: "danger", description: "Hipertansiyon Krizi! Hemen bir sağlık kuruluşuna başvurun." };
    }
    if (systolic >= 140 || diastolic >= 90) {
        return { label: "Yüksek (Evre 2)", status: "danger", description: "Yüksek tansiyon evre 2." };
    }
    if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
        return { label: "Yüksek (Evre 1)", status: "warning", description: "Hafif yüksek tansiyon." };
    }
    if ((systolic >= 120 && systolic <= 129) && diastolic < 80) {
        return { label: "Sınırda", status: "warning", description: "Tansiyon normal sınırı aşmış." };
    }
    if (systolic < 90 || diastolic < 60) {
        return { label: "Düşük", status: "warning", description: "Düşük tansiyon." };
    }
    return { label: "Normal", status: "normal", description: "Tansiyon değerleriniz normal." };
}

// INTERPRET BLOOD SUGAR
function interpretBloodSugar(value, type) {
    if (type === 'fasting') { // Açlık
        if (value < 70) return { label: "Düşük (Hipoglisemi)", status: "danger", description: "Kan şekeriniz çok düşük." };
        if (value >= 126) return { label: "Yüksek (Diyabet)", status: "danger", description: "Açlık kan şekeriniz yüksek." };
        if (value >= 100 && value <= 125) return { label: "Sınırda (Gizli Şeker)", status: "warning", description: "Gizli şeker (prediyabet) belirtisi." };
        return { label: "Normal", status: "normal", description: "Açlık şekeriniz normal." };
    } else { // Tokluk (postprandial)
        if (value < 70) return { label: "Düşük (Hipoglisemi)", status: "danger", description: "Kan şekeriniz çok düşük." };
        if (value >= 200) return { label: "Yüksek (Diyabet)", status: "danger", description: "Tokluk kan şekeriniz yüksek." };
        if (value >= 140 && value <= 199) return { label: "Sınırda", status: "warning", description: "Tokluk şekeriniz sınırda." };
        return { label: "Normal", status: "normal", description: "Tokluk şekeriniz normal." };
    }
}

// DASHBOARD STATE UPDATE
function updateDashboard() {
    updateWaterUI();
    
    // Sort healthData by timestamp descending
    const sortedData = [...state.healthData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 1. Get latest sugar record
    const latestSugar = sortedData.find(item => item.type === "sugar");
    const sugarValEl = document.getElementById("quickSugarVal");
    const sugarTagEl = document.getElementById("quickSugarTag");
    const sugarTimeEl = document.getElementById("quickSugarTime");
    
    if (latestSugar) {
        sugarValEl.textContent = latestSugar.value;
        const measurementType = latestSugar.metadata.sugarType === 'fasting' ? 'Açlık' : 'Tokluk';
        const interpretation = interpretBloodSugar(latestSugar.value, latestSugar.metadata.sugarType);
        
        sugarTagEl.textContent = `${measurementType} - ${interpretation.label}`;
        sugarTagEl.className = `tag status-${interpretation.status}`;
        
        // Custom styling for quick tag text colors
        sugarTagEl.style.color = interpretation.status === 'normal' ? 'var(--color-primary)' : interpretation.status === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
        
        const recordDate = new Date(latestSugar.timestamp);
        sugarTimeEl.textContent = formatRelativeTime(recordDate);
    } else {
        sugarValEl.textContent = "--";
        sugarTagEl.textContent = "Kayıt yok";
        sugarTagEl.className = "tag";
        sugarTagEl.style.color = 'var(--text-muted)';
        sugarTimeEl.textContent = "";
    }
    
    // 2. Get latest pressure record
    const latestBp = sortedData.find(item => item.type === "pressure");
    const bpValEl = document.getElementById("quickBpVal");
    const bpTagEl = document.getElementById("quickBpTag");
    const bpTimeEl = document.getElementById("quickBpTime");
    
    if (latestBp) {
        bpValEl.textContent = `${latestBp.value.systolic}/${latestBp.value.diastolic}`;
        const interpretation = interpretBloodPressure(latestBp.value.systolic, latestBp.value.diastolic);
        
        bpTagEl.textContent = interpretation.label;
        bpTagEl.className = `tag status-${interpretation.status}`;
        bpTagEl.style.color = interpretation.status === 'normal' ? 'var(--color-primary)' : interpretation.status === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
        
        const recordDate = new Date(latestBp.timestamp);
        bpTimeEl.textContent = formatRelativeTime(recordDate);
    } else {
        bpValEl.textContent = "--";
        bpTagEl.textContent = "Kayıt yok";
        bpTagEl.className = "tag";
        bpTagEl.style.color = 'var(--text-muted)';
        bpTimeEl.textContent = "";
    }
    
    // 3. Render 3 recent logs
    const recentActivityContainer = document.getElementById("recentActivityList");
    recentActivityContainer.innerHTML = "";
    const recentLogs = sortedData.slice(0, 3);
    
    if (recentLogs.length > 0) {
        recentLogs.forEach(log => {
            recentActivityContainer.appendChild(createActivityItem(log));
        });
    } else {
        recentActivityContainer.innerHTML = `<div class="empty-state">Henüz hiç sağlık verisi kaydedilmemiş.</div>`;
    }
    
    // 4. Update overall health badge
    updateOverallHealthBadge(sortedData);
}

// OVERALL HEALTH EVALUATION BADGE
function updateOverallHealthBadge(logs) {
    const overallBadge = document.getElementById("overallStatusBadge");
    const overallDesc = document.getElementById("overallStatusDesc");
    
    // Filter logs for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentLogs = logs.filter(log => new Date(log.timestamp) >= sevenDaysAgo);
    
    if (recentLogs.length === 0) {
        overallBadge.textContent = "Yetersiz Veri";
        overallBadge.className = "status-badge warning";
        overallDesc.textContent = "Son 7 güne ait şeker veya tansiyon kaydınız bulunmuyor. Değerlendirme yapabilmem için lütfen kayıt ekleyin.";
        return;
    }
    
    let hasDanger = false;
    let hasWarning = false;
    let recordsChecked = 0;
    
    recentLogs.forEach(log => {
        if (log.type === 'sugar') {
            const interpret = interpretBloodSugar(log.value, log.metadata.sugarType);
            if (interpret.status === 'danger') hasDanger = true;
            if (interpret.status === 'warning') hasWarning = true;
            recordsChecked++;
        } else if (log.type === 'pressure') {
            const interpret = interpretBloodPressure(log.value.systolic, log.value.diastolic);
            if (interpret.status === 'danger') hasDanger = true;
            if (interpret.status === 'warning') hasWarning = true;
            recordsChecked++;
        }
    });
    
    if (recordsChecked === 0) {
        overallBadge.textContent = "Veri Bekleniyor";
        overallBadge.className = "status-badge warning";
        overallDesc.textContent = "Analiz için henüz tansiyon veya şeker ölçümü kaydedilmedi. Kayıt ekle ekranından ilk verinizi ekleyebilirsiniz.";
        return;
    }
    
    if (hasDanger) {
        overallBadge.textContent = "Yüksek Risk / Dikkat";
        overallBadge.className = "status-badge danger";
        overallDesc.textContent = "Son 7 günlük ölçümlerinizde bazı değerler yüksek risk seviyesinde çıkmıştır. Lütfen 'Asistan' sayfasındaki uyarıları inceleyerek doktorunuza danışın.";
    } else if (hasWarning) {
        overallBadge.textContent = "Hafif Yüksek / Sınırda";
        overallBadge.className = "status-badge warning";
        overallDesc.textContent = "Ölçümlerinizde sınırda veya hafif yüksek değerler gözlemlenmiştir. Tuz tüketimi, diyet ve egzersiz alışkanlıklarınıza dikkat etmeniz önerilir.";
    } else {
        overallBadge.textContent = "Tüm Değerler Normal";
        overallBadge.className = "status-badge normal";
        overallDesc.textContent = "Tebrikler! Son 7 günlük şeker ve tansiyon kayıtlarınız ideal referans aralıklarında seyrediyor. Sağlıklı yaşam tarzınızı koruyun.";
    }
}

// CREATE LOG ACTIVITY ELEMENT
function createActivityItem(log) {
    const item = document.createElement("div");
    item.className = "activity-item";
    
    let icon = "❓";
    let iconClass = "weight";
    let title = "";
    let valueStr = "";
    let tagText = "";
    let statusClass = "normal";
    
    if (log.type === 'sugar') {
        icon = "🩸";
        iconClass = "sugar";
        const isFasting = log.metadata.sugarType === 'fasting';
        title = isFasting ? "Açlık Kan Şekeri" : "Tokluk Kan Şekeri";
        valueStr = `${log.value} mg/dL`;
        
        const interp = interpretBloodSugar(log.value, log.metadata.sugarType);
        tagText = interp.label;
        statusClass = interp.status;
    } else if (log.type === 'pressure') {
        icon = "💓";
        iconClass = "bp";
        title = "Kan Basıncı & Nabız";
        valueStr = `${log.value.systolic}/${log.value.diastolic} mmHg`;
        
        const interp = interpretBloodPressure(log.value.systolic, log.value.diastolic);
        tagText = interp.label;
        statusClass = interp.status;
    } else if (log.type === 'weight') {
        icon = "⚖️";
        iconClass = "weight";
        title = "Vücut Ağırlığı";
        valueStr = `${log.value} kg`;
        tagText = "Kilo";
        statusClass = "normal";
    }
    
    const formattedDate = new Date(log.timestamp).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    
    item.innerHTML = `
        <div class="activity-item-left">
            <div class="activity-icon-badge ${iconClass}">${icon}</div>
            <div class="activity-details">
                <span class="activity-title">${title}</span>
                <span class="activity-time">${formattedDate}</span>
                ${log.notes ? `<span class="activity-time" style="font-style: italic;">"${log.notes}"</span>` : ''}
            </div>
        </div>
        <div class="activity-item-right">
            <span class="activity-val">${valueStr}</span>
            <span class="activity-tag status-${statusClass}" style="color: ${statusClass === 'normal' ? 'var(--color-primary)' : statusClass === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)'}">${tagText}</span>
            <button class="delete-btn" onclick="deleteRecord('${log.id}')" title="Kayıt Sil">🗑️</button>
        </div>
    `;
    
    return item;
}

// FORMAT TIME AGO
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return "Az önce";
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays === 1) return "Dün";
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// RENDER ALL HISTORY LIST
function renderHistoryList() {
    const listContainer = document.getElementById("fullHistoryList");
    listContainer.innerHTML = "";
    
    // Sort healthData descending
    let filteredData = [...state.healthData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply filters
    if (activeHistoryFilter !== 'all') {
        filteredData = filteredData.filter(item => item.type === activeHistoryFilter);
    }
    
    if (filteredData.length > 0) {
        filteredData.forEach(log => {
            listContainer.appendChild(createActivityItem(log));
        });
    } else {
        listContainer.innerHTML = `<div class="empty-state">Seçilen kategoriye ait veri bulunamadı.</div>`;
    }
}

// SWITCH HISTORY FILTER
function filterHistory(filter) {
    activeHistoryFilter = filter;
    
    const btns = document.querySelectorAll(".history-filter-btn");
    btns.forEach(btn => btn.classList.remove("active"));
    
    // Match active button by onclick attribute text
    const activeBtn = Array.from(btns).find(btn => btn.getAttribute("onclick").includes(`'${filter}'`));
    if (activeBtn) activeBtn.classList.add("active");
    
    renderHistoryList();
}

// PERIOD SWITCH FOR CHARTS (Günlük / Haftalık / Aylık)
function switchPeriod(period) {
    activePeriod = period;
    
    const btns = document.querySelectorAll(".period-btn");
    btns.forEach(btn => btn.classList.remove("active"));
    
    const activeBtn = Array.from(btns).find(btn => btn.getAttribute("onclick").includes(`'${period}'`));
    if (activeBtn) activeBtn.classList.add("active");
    
    renderCharts();
}

// GET FILTERED DATA FOR CHARTS BASED ON SELECTED PERIOD
function getFilteredRecords(type, period) {
    const now = new Date();
    let cutoff = new Date();
    
    if (period === 'daily') {
        // Last 7 days (show individual readings)
        cutoff.setDate(now.getDate() - 7);
    } else if (period === 'weekly') {
        // Last 14 days
        cutoff.setDate(now.getDate() - 14);
    } else {
        // Last 30 days
        cutoff.setDate(now.getDate() - 30);
    }
    
    return state.healthData
        .filter(item => item.type === type && new Date(item.timestamp) >= cutoff)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// RENDER CHARTS & STATS
function renderCharts() {
    const isDark = document.body.classList.contains("dark-theme");
    const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
    const textColor = isDark ? "#9ca3af" : "#4b5563";
    
    // 1. Calculate Average Stats
    calculateAverages();
    
    // 2. Fetch Sugar Chart Data
    const sugarRecords = getFilteredRecords('sugar', activePeriod);
    const sugarLabels = sugarRecords.map(r => formatChartLabel(r.timestamp, activePeriod));
    const fastingData = sugarRecords.map(r => r.metadata.sugarType === 'fasting' ? r.value : null);
    const postprandialData = sugarRecords.map(r => r.metadata.sugarType === 'postprandial' ? r.value : null);
    
    // Destroy previous sugar chart if exists
    if (sugarChartInstance) {
        sugarChartInstance.destroy();
    }
    
    const sugarCtx = document.getElementById('sugarChart').getContext('2d');
    sugarChartInstance = new Chart(sugarCtx, {
        type: 'line',
        data: {
            labels: sugarLabels,
            datasets: [
                {
                    label: 'Açlık Şekeri',
                    data: fastingData,
                    borderColor: '#10b981', // Emerald
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    spanGaps: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#10b981'
                },
                {
                    label: 'Tokluk Şekeri',
                    data: postprandialData,
                    borderColor: '#06b6d4', // Cyan
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    spanGaps: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#06b6d4'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor, font: { family: 'Outfit', size: 11 } },
                    position: 'top'
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit', size: 10 } },
                    min: 40,
                    max: 300
                }
            }
        }
    });
    
    // 3. Fetch BP Chart Data
    const bpRecords = getFilteredRecords('pressure', activePeriod);
    const bpLabels = bpRecords.map(r => formatChartLabel(r.timestamp, activePeriod));
    const systolicData = bpRecords.map(r => r.value.systolic);
    const diastolicData = bpRecords.map(r => r.value.diastolic);
    const pulseData = bpRecords.map(r => r.value.pulse);
    
    // Destroy previous BP chart if exists
    if (bpChartInstance) {
        bpChartInstance.destroy();
    }
    
    const bpCtx = document.getElementById('bpChart').getContext('2d');
    bpChartInstance = new Chart(bpCtx, {
        type: 'line',
        data: {
            labels: bpLabels,
            datasets: [
                {
                    label: 'Büyük (Sistolik)',
                    data: systolicData,
                    borderColor: '#ef4444', // Red
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0.2,
                    pointRadius: 3
                },
                {
                    label: 'Küçük (Diyastolik)',
                    data: diastolicData,
                    borderColor: '#3b82f6', // Blue
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 3
                },
                {
                    label: 'Nabız',
                    data: pulseData,
                    borderColor: '#f59e0b', // Amber
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    tension: 0.2,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor, font: { family: 'Outfit', size: 11 } },
                    position: 'top'
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Outfit', size: 10 } },
                    min: 40,
                    max: 200
                }
            }
        }
    });
}

// FORMAT TIME LABEL FOR CHARTS
function formatChartLabel(timestampStr, period) {
    const date = new Date(timestampStr);
    if (period === 'daily') {
        // Just show Day + Time
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    // Just show Day
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// CALCULATE AVERAGES FOR OVERVIEW
function calculateAverages() {
    const sugarRecords = getFilteredRecords('sugar', activePeriod);
    const bpRecords = getFilteredRecords('pressure', activePeriod);
    
    const avgFastingEl = document.getElementById("avgFastingSugar");
    const avgPostprandialEl = document.getElementById("avgPostprandialSugar");
    const avgBpEl = document.getElementById("avgBp");
    
    // Fasting sugar average
    const fasting = sugarRecords.filter(r => r.metadata.sugarType === 'fasting');
    if (fasting.length > 0) {
        const sum = fasting.reduce((acc, curr) => acc + curr.value, 0);
        avgFastingEl.textContent = Math.round(sum / fasting.length) + " mg/dL";
    } else {
        avgFastingEl.textContent = "--";
    }
    
    // Postprandial sugar average
    const postprandial = sugarRecords.filter(r => r.metadata.sugarType === 'postprandial');
    if (postprandial.length > 0) {
        const sum = postprandial.reduce((acc, curr) => acc + curr.value, 0);
        avgPostprandialEl.textContent = Math.round(sum / postprandial.length) + " mg/dL";
    } else {
        avgPostprandialEl.textContent = "--";
    }
    
    // Blood pressure average
    if (bpRecords.length > 0) {
        const sumSystolic = bpRecords.reduce((acc, curr) => acc + curr.value.systolic, 0);
        const sumDiastolic = bpRecords.reduce((acc, curr) => acc + curr.value.diastolic, 0);
        const avgSys = Math.round(sumSystolic / bpRecords.length);
        const avgDia = Math.round(sumDiastolic / bpRecords.length);
        avgBpEl.textContent = `${avgSys}/${avgDia} mmHg`;
    } else {
        avgBpEl.textContent = "--";
    }
}

// HELPER FOR EXTRACTING JSON FROM GEMINI CODE BLOCKS
function extractJSON(text) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
        return match[1].trim();
    }
    return text.trim();
}

// ASISTANT ADVICE REPORTS ENGINE
async function generateAdviceReport(forceRefresh = false) {
    const adviceContainer = document.getElementById("adviceContainer");
    const promoBanner = document.getElementById("geminiPromoBanner");
    const activeBadge = document.getElementById("geminiActiveBadge");
    const methodText = document.getElementById("assistantMethodText");
    
    // Default visibility configs
    if (promoBanner) promoBanner.style.display = "none";
    if (activeBadge) activeBadge.style.display = "none";
    if (methodText) methodText.textContent = "Değerlerinizi yerel kurallara göre yorumlayıp tavsiye üretiyorum.";

    const sortedData = [...state.healthData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Get last 14 days of logs (more context for AI)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const recentLogs = sortedData.filter(log => new Date(log.timestamp) >= fourteenDaysAgo);
    
    const sugarLogs = recentLogs.filter(log => log.type === 'sugar');
    const bpLogs = recentLogs.filter(log => log.type === 'pressure');
    
    if (sugarLogs.length === 0 && bpLogs.length === 0) {
        adviceContainer.innerHTML = `
            <div class="advice-card notice-card">
                <h4>🤖 Henüz Yeterli Veri Yok</h4>
                <p>Genel sağlık yorumu ve tavsiyeler üretebilmem için son 14 gün içerisinde en az bir şeker veya tansiyon ölçüm değeri girmelisiniz. Lütfen 'Kayıt Ekle' sayfasından yeni ölçümler ekleyin.</p>
            </div>
        `;
        return;
    }

    // Check if Gemini API key is configured
    if (state.geminiApiKey && state.geminiApiKey.trim() !== "") {
        if (activeBadge) activeBadge.style.display = "inline-block";
        if (methodText) methodText.textContent = "Değerlerinizi Google Gemini AI modelini kullanarak analiz ediyor ve tavsiyeler üretiyorum.";
        
        // Check session storage cache first
        const cachedAdvice = sessionStorage.getItem("cached_gemini_advice");
        if (cachedAdvice && !forceRefresh) {
            try {
                const parsed = JSON.parse(cachedAdvice);
                renderGeminiAdvice(parsed);
                return;
            } catch (e) {
                sessionStorage.removeItem("cached_gemini_advice");
            }
        }
        
        // Show loading spinner
        adviceContainer.innerHTML = `
            <div class="spinner-container">
                <div class="spinner"></div>
                <p style="font-size: 13px; color: var(--text-secondary);">Gemini Sağlık Asistanı verilerinizi analiz ediyor, lütfen bekleyin...</p>
            </div>
        `;
        
        try {
            // Build health log summary text
            let logSummary = `Hasta Adı: ${state.username || 'Kullanıcı'}\nSon 14 Güne Ait Ölçüm Raporları:\n\n`;
            
            if (sugarLogs.length > 0) {
                logSummary += "--- KAN ŞEKERİ ÖLÇÜMLERİ ---\n";
                sugarLogs.forEach(l => {
                    const typeStr = l.metadata.sugarType === 'fasting' ? 'Açlık Şekeri' : 'Tokluk Şekeri';
                    logSummary += `- ${l.date} ${l.time}: ${l.value} mg/dL (${typeStr}) ${l.notes ? `[Not: ${l.notes}]` : ''}\n`;
                });
                logSummary += "\n";
            }
            
            if (bpLogs.length > 0) {
                logSummary += "--- TANSİYON VE NABIZ ÖLÇÜMLERİ ---\n";
                bpLogs.forEach(l => {
                    logSummary += `- ${l.date} ${l.time}: Büyük: ${l.value.systolic}, Küçük: ${l.value.diastolic} mmHg, Nabız: ${l.value.pulse} vuru/dk ${l.notes ? `[Not: ${l.notes}]` : ''}\n`;
                });
                logSummary += "\n";
            }
            
            const weightLogs = recentLogs.filter(l => l.type === 'weight');
            if (weightLogs.length > 0) {
                logSummary += "--- VÜCUT AĞIRLIĞI / KİLO KAYITLARI ---\n";
                weightLogs.forEach(l => {
                    logSummary += `- ${l.date} ${l.time}: ${l.value} kg ${l.notes ? `[Not: ${l.notes}]` : ''}\n`;
                });
                logSummary += "\n";
            }

            const promptText = `
Sen uzman bir mobil sağlık asistanısın. Kullanıcının sağladığı son 14 günlük sağlık ölçümlerini ve günlük su tüketim bilgilerini analiz et.
Bu verilere dayanarak, kullanıcının şeker, tansiyon ve genel durumu hakkında profesyonel, yapıcı, teşvik edici bir değerlendirme yap.

Aşağıdaki kuralları göz önünde bulundur:
- Şeker sınırları: Açlık normal (<100), sınırda (100-125), yüksek (>=126). Tokluk normal (<140), sınırda (140-199), yüksek (>=200).
- Tansiyon sınırları: Normal (<120/80), yüksek evre 1 (130-139/80-89), yüksek evre 2 (>=140/90), kriz (>180/120).
- Yaşam tarzı önerileri: Su tüketimi, tuzun azaltılması, lifli gıdalar, yürüyüş vb.
- Önerilerinde asla kesin bir reçete yazma veya ilaç tavsiyesi verme, her zaman tıbbi bir durum varsa "doktorunuza danışın" uyarısı ekle.
- Yanıt dilin samimi, anlaşılır ve tamamen Türkçe olmalıdır.

Aşağıdaki JSON yapısında KESİNLİKLE geçerli bir JSON yanıtı döndür. Yanıtında JSON bloğu dışında hiçbir açıklama veya metin olmasın (sadece saf JSON döndür).

JSON Şablonu:
{
  "overallStatus": "normal" veya "warning" veya "danger",
  "overallStatusText": "Genel sağlık durumunun gidişatını özetleyen 1-2 cümlelik açıklama.",
  "cards": [
    {
      "title": "Kan Şekeri Analizi",
      "icon": "🩸",
      "status": "normal" veya "warning" veya "danger",
      "text": "Kan şekeri ölçümlerinin gidişatı, ortalaması ve tıbbi değerlendirmesi.",
      "tips": [
        "Glisemik indeksi yüksek gıdalardan kaçının.",
        "Öğün düzenine özen gösterin."
      ]
    },
    {
      "title": "Kan Basıncı & Tansiyon Analizi",
      "icon": "💓",
      "status": "normal" veya "warning" veya "danger",
      "text": "Tansiyon ve nabız değerlerinin analiz edilmesi, ortalama ve kriz durumlarının kontrolü.",
      "tips": [
        "Tuz tüketimini günde 1 çay kaşığı ile sınırlayın.",
        "Stres yönetimine dikkat edin."
      ]
    },
    {
      "title": "Yaşam Tarzı ve Beslenme Önerileri",
      "icon": "🍏",
      "status": "normal" veya "warning",
      "text": "Kullanıcıya özel egzersiz, su içme (günlük 2.5L su önerisi) ve genel beslenme önerileri.",
      "tips": [
        "Günde en az 30 dakika orta tempolu yürüyüş yapın.",
        "Lifli gıdaları ve taze sebzeleri öğünlerinize ekleyin."
      ]
    }
  ]
}

İşte hastanın analiz etmen gereken verileri:
${logSummary}
            `;

            // Call Google Gemini API
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: promptText
                        }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API returned status ${response.status}`);
            }

            const resData = await response.json();
            const rawText = resData.candidates[0].content.parts[0].text;
            const cleanedJsonText = extractJSON(rawText);
            
            // Validate JSON
            const parsedAdvice = JSON.parse(cleanedJsonText);
            
            // Cache the advice
            sessionStorage.setItem("cached_gemini_advice", cleanedJsonText);
            
            renderGeminiAdvice(parsedAdvice);
            showToast("Tavsiyeler Gemini AI ile güncellendi.");
            
        } catch (error) {
            console.error("Gemini API Error:", error);
            showToast("Gemini API hatası! Çevrimdışı kurallara dönülüyor.");
            generateRuleBasedAdvice(sugarLogs, bpLogs);
        }
    } else {
        // Gemini key is not configured, show promo and run rule-based
        if (promoBanner) promoBanner.style.display = "block";
        generateRuleBasedAdvice(sugarLogs, bpLogs);
    }
}

// RENDER GEMINI PARSED ADVICE
function renderGeminiAdvice(data) {
    const adviceContainer = document.getElementById("adviceContainer");
    adviceContainer.innerHTML = "";
    
    // Render status card if present
    if (data.overallStatus && data.overallStatusText) {
        const overallCard = document.createElement("div");
        overallCard.className = `advice-card notice-card`;
        overallCard.style.borderLeftColor = data.overallStatus === 'normal' ? 'var(--color-primary)' : data.overallStatus === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
        overallCard.innerHTML = `
            <h4>🤖 Akıllı Durum Özeti</h4>
            <p>${data.overallStatusText}</p>
        `;
        adviceContainer.appendChild(overallCard);
    }
    
    // Render individual advice cards
    if (data.cards && data.cards.length > 0) {
        data.cards.forEach(cardData => {
            appendAdviceCard(cardData.icon || "📋", cardData);
        });
    }
}

// FALLBACK RULE-BASED ADVICE ENGINE (ORIGINAL LOGIC)
function generateRuleBasedAdvice(sugarLogs, bpLogs) {
    const adviceContainer = document.getElementById("adviceContainer");
    adviceContainer.innerHTML = "";
    
    // 1. Analyze Blood Sugar
    if (sugarLogs.length > 0) {
        let sugarAdvice = {
            title: "Kan Şekeri Değerlendirmesi",
            status: "normal",
            text: "",
            tips: []
        };
        
        let highCount = 0;
        let lowCount = 0;
        let totalVal = 0;
        
        sugarLogs.forEach(log => {
            totalVal += log.value;
            const interp = interpretBloodSugar(log.value, log.metadata.sugarType);
            if (interp.status === 'danger') {
                if (log.value < 70) lowCount++;
                else highCount++;
            }
        });
        
        const avgSugar = Math.round(totalVal / sugarLogs.length);
        
        if (highCount > 0) {
            sugarAdvice.status = "danger";
            sugarAdvice.text = `Son 14 günde kaydettiğiniz kan şekeri ölçümlerinizde ${highCount} kez yüksek değerler tespit edildi. Ortalama şeker düzeyiniz ${avgSugar} mg/dL'dir. Bu durum diyabet riski taşıyabilir.`;
            sugarAdvice.tips = [
                "Glisemik indeksi yüksek gıdalardan (beyaz un, şekerli içecekler, tatlılar) kaçının.",
                "Öğünlerinize posalı lifli gıdalar, sebzeler ve sağlıklı proteinler ekleyin.",
                "Günde en az 30 dakika orta tempolu yürüyüş kan şekerini dengelemeye yardımcı olur.",
                "En kısa sürede bir Dahiliye veya Endokrinoloji hekimine başvurarak kontrol yaptırın."
            ];
        } else if (lowCount > 0) {
            sugarAdvice.status = "danger";
            sugarAdvice.text = `Son 14 günde şeker değerlerinizin ${lowCount} kez normalin altına düştüğü (hipoglisemi) gözlemlendi. Şekerin 70 mg/dL'nin altına inmesi ciddi halsizlik, soğuk terleme ve baş dönmesi yapabilir.`;
            sugarAdvice.tips = [
                "Öğünlerinizi atlamayın, düzenli aralıklarla beslenin.",
                "Şeker düştüğü anlarda hızlı etki eden karbonhidrat (kesme şeker, meyve suyu) tüketin.",
                "Yanınızda her zaman kuru meyve veya leblebi gibi küçük atıştırmalıklar bulundurun.",
                "İlaç kullanıyorsanız doz ayarlaması için mutlaka doktorunuzla görüşün."
            ];
        } else {
            let warnCount = sugarLogs.filter(log => interpretBloodSugar(log.value, log.metadata.sugarType).status === 'warning').length;
            if (warnCount > 0) {
                sugarAdvice.status = "warning";
                sugarAdvice.text = `Kan şekeriniz genel olarak kontrol altında görünse de, ${warnCount} adet sınırda (prediyabet/gizli şeker sınırında) değer ölçülmüştür.`;
                sugarAdvice.tips = [
                    "Paketli ve hazır gıdaları hayatınızdan kademeli olarak çıkarın.",
                    "Rafine karbonhidratlar yerine tam buğday, yulaf gibi kompleks gıdaları tercih edin.",
                    "Öğün sonrası aktif kalarak hafif hareketler yapın."
                ];
            } else {
                sugarAdvice.status = "normal";
                sugarAdvice.text = `Harika! Son 14 günlük tüm şeker ölçümleriniz (ortalama ${avgSugar} mg/dL) ideal sınırlarda seyrediyor.`;
                sugarAdvice.tips = [
                    "Dengeli ve düzenli beslenme alışkanlığınızı sürdürün.",
                    "Günde 2-2.5 litre su içmeye devam edin.",
                    "Yıllık rutin taramalarınızı yaptırmayı ihmal etmeyin."
                ];
            }
        }
        
        appendAdviceCard("🩸", sugarAdvice);
    }
    
    // 2. Analyze Blood Pressure
    if (bpLogs.length > 0) {
        let bpAdvice = {
            title: "Kan Basıncı Değerlendirmesi",
            status: "normal",
            text: "",
            tips: []
        };
        
        let crisisCount = 0;
        let highCount = 0;
        let lowCount = 0;
        let warnCount = 0;
        
        bpLogs.forEach(log => {
            const interp = interpretBloodPressure(log.value.systolic, log.value.diastolic);
            if (interp.label.includes("Kriz")) crisisCount++;
            else if (interp.status === 'danger') highCount++;
            else if (interp.status === 'warning') {
                if (interp.label.includes("Düşük")) lowCount++;
                else warnCount++;
            }
        });
        
        if (crisisCount > 0) {
            bpAdvice.status = "danger";
            bpAdvice.text = `⚠️ DİKKAT! Son ölçümlerinizde tansiyon değerinizin kritik sınırları aştığı (${crisisCount} kez) görüldü. Hipertansiyon krizi ciddi organ hasarlarına yol açabilir.`;
            bpAdvice.tips = [
                "Lütfen kendinizi yoracak tüm aktiviteleri bırakıp sakin bir yerde dinlenin.",
                "Eğer baş dönmesi, ense ağrısı, göğüste sıkışma hissi varsa acilen 112'yi arayın veya acile başvurun.",
                "Tansiyon düşürücü ilaçlarınızı doktorunuzun önerdiği şekilde aldığınızdan emin olun."
            ];
        } else if (highCount > 0) {
            bpAdvice.status = "danger";
            bpAdvice.text = `Tansiyon ölçümlerinizde ${highCount} kez Evre 2 hipertansiyon (140/90 mmHg ve üzeri) kaydedilmiştir. Kronik yüksek tansiyon kalp ve damar sağlığını olumsuz etkiler.`;
            bpAdvice.tips = [
                "Yemeklerinizdeki tuz oranını ciddi derecede sınırlayın (günlük maksimum 1 çay kaşığı).",
                "Kafein (kahve, çay, kola) ve asitli içecek tüketimini minimuma indirin.",
                "Doktorunuzun yönlendirmesiyle tansiyon takibini sabah ve akşam düzenli yapın ve kardiyoloji uzmanına görünün."
            ];
        } else if (warnCount > 0) {
            bpAdvice.status = "warning";
            bpAdvice.text = `Tansiyon değerleriniz genel olarak kontrol altında olmakla birlikte, sınırda yüksek seyreden (${warnCount} kez) ölçümler mevcuttur.`;
            bpAdvice.tips = [
                "Stres seviyenizi azaltacak nefes egzersizleri veya hobiler edinin.",
                "Beslenmenizde potasyum zengini besinlere (muz, ıspanak, patates) yer verin (hekiminiz onaylıyorsa).",
                "Kilo kontrolüne dikkat ederek düzenli hafif kardiyo yapın."
            ];
        } else if (lowCount > 0) {
            bpAdvice.status = "warning";
            bpAdvice.text = `Ölçümlerinizde ${lowCount} kez düşük tansiyon (90/60 mmHg altı) kaydedilmiştir. Halsizlik, yorgunluk yapabilir.`;
            bpAdvice.tips = [
                "Günlük sıvı alımınızı artırın.",
                "Ayağa aniden kalkmak yerine yavaşça kalkarak tansiyon düşmesini engelleyin.",
                "Tuz tüketiminiz aşırı düşükse hekim kontrolünde hafifçe artırılabilir."
            ];
        } else {
            bpAdvice.status = "normal";
            bpAdvice.text = "Tebrikler! Son 14 gündeki tansiyon ölçümleriniz ideal aralıktadır.";
            bpAdvice.tips = [
                "Tuz tüketimini ideal düzeyde tutmaya devam edin.",
                "Aktif ve stressiz yaşama özen gösterin.",
                "Haftada birkaç kez kontrol amaçlı ölçüm yapmaya devam edebilirsiniz."
            ];
        }
        
        appendAdviceCard("💓", bpAdvice);
    }
}


// RENDER INDIVIDUAL ADVICE CARD
function appendAdviceCard(icon, data) {
    const container = document.getElementById("adviceContainer");
    
    const card = document.createElement("div");
    card.className = `advice-card ${data.status}-card`;
    
    let tipsHtml = "";
    if (data.tips && data.tips.length > 0) {
        tipsHtml = `<ul style="margin-top: 10px; padding-left: 18px; font-size: 12.5px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 5px;">
            ${data.tips.map(tip => `<li>${tip}</li>`).join('')}
        </ul>`;
    }
    
    card.innerHTML = `
        <h4>${icon} ${data.title}</h4>
        <p>${data.text}</p>
        ${tipsHtml}
    `;
    
    container.appendChild(card);
}

// PROFILE SAVE NAME
function saveProfileName() {
    const input = document.getElementById("usernameInput");
    const name = input.value.trim();
    if (name) {
        state.username = name;
        saveState();
        document.getElementById("displayUsername").textContent = name;
        showToast("Profil adı güncellendi.");
    }
}

// EXPORT DATA (JSON DOWNLOAD)
function exportData() {
    if (state.healthData.length === 0) {
        alert("Dışa aktarılacak veri bulunamadı.");
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `saglik_takip_verileri_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Veriler başarıyla dışa aktarıldı.");
}

// TRIGGER IMPORT FILE SELECT
function triggerImport() {
    document.getElementById("importFileInput").click();
}

// IMPORT DATA FROM JSON
function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            if (imported && (imported.healthData || imported.waterCount)) {
                if (confirm("Bu işlem mevcut verilerinizin üzerine yazacaktır. Devam etmek istiyor musunuz?")) {
                    state.healthData = imported.healthData || [];
                    state.waterCount = imported.waterCount || 0;
                    state.username = imported.username || "Kullanıcı";
                    state.lastWaterDate = imported.lastWaterDate || "";
                    
                    saveState();
                    loadState();
                    updateDashboard();
                    showToast("Veriler başarıyla içe aktarıldı.");
                    switchPage('dashboard');
                }
            } else {
                alert("Geçersiz veri dosyası yapısı.");
            }
        } catch (err) {
            alert("Dosya okunurken hata oluştu. Lütfen geçerli bir yedek dosyası seçin.");
        }
    };
    reader.readAsText(file);
}

// CLEAR ALL STATE
function clearAllData() {
    if (confirm("DİKKAT: Tüm sağlık geçmişiniz ve profil bilgileriniz kalıcı olarak silinecektir! Bu işlemi onaylıyor musunuz?")) {
        state = {
            healthData: [],
            waterCount: 0,
            lastWaterDate: new Date().toISOString().split('T')[0],
            username: "Kullanıcı"
        };
        saveState();
        loadState();
        updateDashboard();
        showToast("Tüm uygulama verileri sıfırlandı.");
        switchPage('dashboard');
    }
}
