// ================================================================
// Face Recognition Attendance System — Premium Dashboard App Logic
// ApexCharts, Dark Mode, Collapsible Sidebar, Pagination
// ================================================================

// --- Global State ---
let currentTab = 'dashboard';
let webcamStream = null;
let registerStream = null;
let scannerInterval = null;
let isScannerRunning = false;
let currentRegisterStudentId = null;

// Chart instances (ApexCharts)
let weeklyChartObj = null;
let deptChartObj = null;

// Pagination state
let studentsData = [];
let currentPage = 1;
const PAGE_SIZE = 8;

// Scan counter
let totalScanCount = 0;

// ================================================================
// INITIALIZATION
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTabRouting();
    initSidebar();
    initDarkMode();
    initGlobalSearch();
    refreshDashboard();
    initScannerControls();
    initForms();
    initMotionAnimations();
    initNotificationDropdown();

    // Load admin profile
    fetch('/api/auth/status')
        .then(res => res.json())
        .then(data => {
            if (data.logged_in) {
                const name = data.username || 'Admin';
                document.getElementById('adminUsername').textContent = name;
                document.getElementById('adminProfileName').textContent = name;
                document.getElementById('adminAvatar').textContent = name.charAt(0).toUpperCase();
            }
        });

    // Liveness slider
    const slider = document.getElementById('livenessThresholdSlider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            document.getElementById('livenessThresholdVal').textContent = e.target.value;
        });
    }
});

// ================================================================
// SIDEBAR TOGGLE
// ================================================================
function initSidebar() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');
    const mainContent = document.getElementById('mainContent');
    const overlay = document.getElementById('mobileOverlay');

    toggle.addEventListener('click', () => {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
        } else {
            sidebar.classList.toggle('collapsed');
            // Adjust topbar left position
            if (sidebar.classList.contains('collapsed')) {
                topbar.style.left = 'var(--sidebar-collapsed-width)';
            } else {
                topbar.style.left = 'var(--sidebar-width)';
            }
        }
    });

    // Close mobile sidebar on overlay click
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }
}

// ================================================================
// DARK MODE
// ================================================================
function initDarkMode() {
    const btn = document.getElementById('darkModeToggle');
    const icon = document.getElementById('darkModeIcon');

    // Load saved preference
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        icon.classList.replace('fa-moon', 'fa-sun');
    }

    btn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            icon.classList.replace('fa-sun', 'fa-moon');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            icon.classList.replace('fa-moon', 'fa-sun');
            localStorage.setItem('theme', 'dark');
        }

        // Redraw charts for theme change
        if (currentTab === 'dashboard') {
            refreshDashboard();
        }
    });
}

// ================================================================
// GLOBAL SEARCH
// ================================================================
function initGlobalSearch() {
    const input = document.getElementById('globalSearch');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = input.value.trim();
            if (!q) return;

            // Switch to students tab and search
            switchToTab('students');
            document.getElementById('studentSearchInput').value = q;
            loadStudents();
            input.value = '';
        }
    });
}

// ================================================================
// MOTION ANIMATIONS INITIALIZATION
// ================================================================
function initMotionAnimations() {
    // Animations removed
}

// ================================================================
// KPI DRILL DOWN NAVIGATION
// ================================================================
function drillDown(type) {
    if (event) {
        // Handle Ripple Effect
        const card = event.currentTarget;
        const ripple = card.querySelector('.ripple-bg');
        if (ripple) {
            ripple.style.animation = 'none';
            ripple.offsetHeight; // trigger reflow
            ripple.style.animation = 'ripple-animation 0.6s linear';
        }
    }

    // Delay slightly to let the ripple and scale animation play
    setTimeout(() => {
        if (type === 'all') {
            switchToTab('students');
            window.currentStudentFilter = 'all';
        } else if (type === 'present') {
            switchToTab('students');
            window.currentStudentFilter = 'present';
        } else if (type === 'absent') {
            switchToTab('students');
            window.currentStudentFilter = 'absent';
        } else if (type === 'at-risk') {
            switchToTab('students');
            window.currentStudentFilter = 'at-risk';
        } else if (type === 'attendance-rate' || type === 'accuracy') {
            switchToTab('reports');
        }
    }, 150);
}

// ================================================================
// TAB ROUTING
// ================================================================
function initTabRouting() {
    const links = document.querySelectorAll('.menu-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = link.getAttribute('data-tab');
            
            // Reset filter on manual tab switch
            if (targetTab === 'students') {
                window.currentStudentFilter = 'all';
            }
            
            switchToTab(targetTab);
        });
    });
}

function switchToTab(targetTab) {
    if (targetTab === currentTab) return;

    // Stop scanner if leaving
    if (currentTab === 'scanner' && isScannerRunning) {
        stopScanner();
    }

    // Update nav links
    document.querySelectorAll('.menu-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.menu-link[data-tab="${targetTab}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Toggle sections
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
    const targetSection = document.getElementById(`${targetTab}-tab`);
    if (targetSection) {
        targetSection.classList.add('active-tab');
    }

    currentTab = targetTab;

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');

    // Load tab data
    if (currentTab === 'dashboard') refreshDashboard();
    else if (currentTab === 'students') loadStudents();
    else if (currentTab === 'reports') loadReportData();
}

// ================================================================
// REFRESH CURRENT TAB
// ================================================================
function refreshCurrentTab() {
    // Spin the refresh icon for visual feedback
    const btn = document.getElementById('refreshBtn');
    const icon = btn ? btn.querySelector('i') : null;
    if (icon) {
        icon.classList.add('fa-spin');
        setTimeout(() => icon.classList.remove('fa-spin'), 1000);
    }

    if (currentTab === 'dashboard') refreshDashboard();
    else if (currentTab === 'students') loadStudents();
    else if (currentTab === 'reports') loadReportData();

    showToast('Data refreshed!', 'success');
}

// ================================================================
// TOAST NOTIFICATIONS
// ================================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'danger') icon = 'fa-circle-exclamation';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.2s cubic-bezier(0.16,1,0.3,1) reverse forwards';
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}

// ================================================================
// DASHBOARD
// ================================================================
async function refreshDashboard() {
    try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) throw new Error('Failed to load statistics');
        const data = await response.json();

        // Animate KPI numbers
        animateValue('stat-total-students', data.total_students);
        animateValue('stat-present-today', data.present_today);
        animateValue('stat-absent-today', data.absent_today);
        document.getElementById('stat-attendance-rate').textContent = `${data.attendance_rate}%`;
        animateValue('stat-at-risk', data.at_risk_count);
        animateValue('stat-total-scans', totalScanCount);

        // Update timestamp
        const now = new Date();
        document.getElementById('lastUpdatedTime').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Render charts
        renderWeeklyChart(data.weekly_trend);
        renderDeptChart(data.department_distribution);
        renderPredictionChart(data.weekly_trend);

        // Load activity & notifications
        loadRecentActivity();
        loadNotifications();

    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function animateValue(id, endVal) {
    const el = document.getElementById(id);
    if (!el) return;
    const startVal = parseInt(el.textContent) || 0;
    if (startVal === endVal) { el.textContent = endVal; return; }

    const duration = 600;
    const steps = 30;
    const stepTime = duration / steps;
    const increment = (endVal - startVal) / steps;
    let current = startVal;
    let step = 0;

    const timer = setInterval(() => {
        step++;
        current += increment;
        el.textContent = Math.round(current);
        if (step >= steps) {
            el.textContent = endVal;
            clearInterval(timer);
        }
    }, stepTime);
}

// ================================================================
// APEXCHARTS — Weekly Trend
// ================================================================
function renderWeeklyChart(trendData) {
    const container = document.getElementById('weeklyChart');
    if (weeklyChartObj) weeklyChartObj.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const labels = trendData.map(item => item.date);
    const counts = trendData.map(item => item.count);

    const options = {
        series: [{
            name: 'Present Students',
            data: counts
        }],
        chart: {
            type: 'area',
            height: 270,
            fontFamily: 'Inter, sans-serif',
            toolbar: { show: false },
            background: 'transparent',
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800
            }
        },
        colors: ['#3b82f6'],
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [0, 90, 100]
            }
        },
        stroke: {
            curve: 'smooth',
            width: 3
        },
        dataLabels: { enabled: false },
        xaxis: {
            categories: labels,
            labels: {
                style: {
                    colors: isDark ? '#94a3b8' : '#6b7280',
                    fontSize: '11px',
                    fontWeight: 500
                }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                style: {
                    colors: isDark ? '#94a3b8' : '#6b7280',
                    fontSize: '11px'
                },
                formatter: val => Math.round(val)
            }
        },
        grid: {
            borderColor: isDark ? '#334155' : '#f1f5f9',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } }
        },
        markers: {
            size: 4,
            colors: ['#3b82f6'],
            strokeColors: '#ffffff',
            strokeWidth: 2,
            hover: { size: 7 }
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: { formatter: val => `${val} student${val !== 1 ? 's' : ''}` }
        }
    };

    weeklyChartObj = new ApexCharts(container, options);
    weeklyChartObj.render();
}

// ================================================================
// APEXCHARTS — Department Distribution
// ================================================================
function renderDeptChart(deptData) {
    const container = document.getElementById('deptChart');
    if (deptChartObj) deptChartObj.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const labels = Object.keys(deptData);
    const values = Object.values(deptData);

    const colorMap = {
        'Computer Science': '#3B82F6',
        'Electronics Eng': '#14B8A6',
        'Information Technology': '#8B5CF6',
        'Mechanical Eng': '#FBBF24'
    };
    const mappedColors = labels.map(label => colorMap[label] || '#94a3b8');

    const options = {
        series: values,
        chart: {
            type: 'donut',
            height: 270,
            fontFamily: 'Inter, sans-serif',
            background: 'transparent'
        },
        labels: labels,
        colors: mappedColors,
        plotOptions: {
            pie: {
                donut: {
                    size: '72%',
                    labels: {
                        show: true,
                        name: {
                            fontSize: '13px',
                            fontWeight: 600,
                            color: isDark ? '#e2e8f0' : '#374151'
                        },
                        value: {
                            fontSize: '22px',
                            fontWeight: 700,
                            color: isDark ? '#f1f5f9' : '#111827',
                            formatter: val => val
                        },
                        total: {
                            show: true,
                            label: 'Total',
                            fontSize: '12px',
                            color: isDark ? '#94a3b8' : '#6b7280',
                            formatter: w => w.globals.seriesTotals.reduce((a, b) => a + b, 0)
                        }
                    }
                }
            }
        },
        stroke: {
            width: 3,
            colors: [isDark ? '#1e293b' : '#ffffff']
        },
        legend: {
            position: 'bottom',
            fontSize: '11px',
            fontWeight: 500,
            labels: { colors: isDark ? '#94a3b8' : '#6b7280' },
            markers: { width: 8, height: 8, radius: 4 }
        },
        dataLabels: { enabled: false },
        tooltip: {
            theme: isDark ? 'dark' : 'light'
        }
    };

    deptChartObj = new ApexCharts(container, options);
    deptChartObj.render();
}

// ================================================================
// APEXCHARTS — AI Prediction
// ================================================================
let predictionChartObj = null;

function renderPredictionChart(trendData) {
    const container = document.getElementById('predictionChart');
    if (!container) return;
    if (predictionChartObj) predictionChartObj.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    // Generate mock prediction data based on last data points
    let baseVal = 0;
    if (trendData && trendData.length > 0) {
        baseVal = trendData[trendData.length - 1].count;
    } else {
        baseVal = 20;
    }
    
    const dates = [];
    const actuals = [];
    const predictions = [];
    
    const today = new Date();
    for (let i = -3; i <= 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));
        
        if (i <= 0) {
            actuals.push(Math.round(baseVal + (Math.random() * 5 - 2.5)));
            predictions.push(null);
        } else {
            actuals.push(null);
            predictions.push(Math.round(baseVal + (Math.random() * 8 - 1)));
        }
    }
    
    // Connect the lines visually
    predictions[3] = actuals[3];

    const options = {
        series: [
            { name: 'Actual', data: actuals },
            { name: 'Predicted', data: predictions }
        ],
        chart: {
            type: 'line',
            height: 270,
            fontFamily: 'Inter, sans-serif',
            toolbar: { show: false },
            background: 'transparent',
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800
            }
        },
        colors: ['#3b82f6', '#8b5cf6'],
        stroke: {
            curve: 'smooth',
            width: [3, 3],
            dashArray: [0, 5]
        },
        dataLabels: { enabled: false },
        xaxis: {
            categories: dates,
            labels: {
                style: {
                    colors: isDark ? '#94a3b8' : '#6b7280',
                    fontSize: '11px',
                    fontWeight: 500
                }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                style: {
                    colors: isDark ? '#94a3b8' : '#6b7280',
                    fontSize: '11px'
                }
            }
        },
        grid: {
            borderColor: isDark ? '#334155' : '#f1f5f9',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } }
        },
        markers: {
            size: 4,
            colors: ['#3b82f6', '#8b5cf6'],
            strokeColors: '#ffffff',
            strokeWidth: 2,
            hover: { size: 7 }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            labels: { colors: isDark ? '#94a3b8' : '#6b7280' }
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light'
        }
    };

    predictionChartObj = new ApexCharts(container, options);
    predictionChartObj.render();
}

// ================================================================
// RECENT ACTIVITY
// ================================================================
async function loadRecentActivity() {
    const container = document.getElementById('recentActivityList');
    try {
        const res = await fetch('/api/attendance?');
        if (!res.ok) throw new Error();
        const logs = await res.json();

        container.innerHTML = '';
        const recent = logs.slice(0, 8);

        if (recent.length === 0) {
            container.innerHTML = '<p class="text-secondary text-sm" style="text-align:center; padding:2rem 0;">No recent activity</p>';
            return;
        }

        recent.forEach(log => {
            const date = new Date(log.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const isPresent = log.status === 'Present';

            const item = document.createElement('div');
            item.className = 'log-entry';
            item.innerHTML = `
                <div class="log-info">
                    <h4>${log.name}</h4>
                    <span>${log.roll_number} • ${log.subject} • ${dateStr} ${timeStr}</span>
                </div>
                <span class="log-status ${isPresent ? 'marked' : 'spoof'}">${log.status}</span>
            `;
            container.appendChild(item);
        });
    } catch {
        container.innerHTML = '<p class="text-secondary text-sm" style="text-align:center; padding:1rem;">Error loading activity</p>';
    }
}

// ================================================================
// NOTIFICATIONS FEED
// ================================================================
async function loadNotifications() {
    const box = document.getElementById('notificationLogBox');
    try {
        const res = await fetch('/api/notifications');
        if (!res.ok) throw new Error();
        const data = await res.json();

        box.innerHTML = '';
        if (data.length === 0 || data[0].includes('No notification')) {
            box.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:1rem;">No parent alerts dispatched today.</div>';
            // Hide notification badge
            const badge = document.getElementById('notifBadge');
            if (badge) badge.style.display = 'none';
            return;
        }

        // Show badge
        const badge = document.getElementById('notifBadge');
        if (badge) badge.style.display = 'block';

        data.forEach(notif => {
            const div = document.createElement('div');
            div.style.marginBottom = '0.45rem';
            div.style.paddingBottom = '0.35rem';
            div.style.borderBottom = '1px solid var(--border-light)';
            div.style.lineHeight = '1.5';

            if (notif.includes('[ALERT]')) {
                div.innerHTML = notif.replace('[ALERT]', '<span style="color:var(--primary-500); font-weight:700;">[SMS/EMAIL ALERT]</span>');
            } else {
                div.textContent = notif;
            }
            box.appendChild(div);
        });
    } catch {
        box.textContent = 'Error loading notifications.';
    }
}

function initNotificationDropdown() {
    const btn = document.getElementById('notificationBtn');
    const dropdown = document.getElementById('notificationDropdown');
    const list = document.getElementById('dropdownNotifList');

    if (!btn || !dropdown) return;

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // Toggle visibility
        if (dropdown.style.display === 'none') {
            dropdown.style.display = 'block';
            list.innerHTML = '<div style="text-align:center; padding:1rem;">Loading...</div>';
            
            try {
                const res = await fetch('/api/notifications');
                if (!res.ok) throw new Error();
                const data = await res.json();
                
                list.innerHTML = '';
                if (data.length === 0 || data[0].includes('No notification')) {
                    list.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:1rem;">No new notifications.</div>';
                    return;
                }
                
                data.forEach(notif => {
                    const div = document.createElement('div');
                    div.style.marginBottom = '0.5rem';
                    div.style.paddingBottom = '0.5rem';
                    div.style.borderBottom = '1px solid var(--border-light)';
                    div.style.lineHeight = '1.4';
                    
                    if (notif.includes('[ALERT]')) {
                        div.innerHTML = notif.replace('[ALERT]', '<span style="color:var(--primary-500); font-weight:700;">[ALERT]</span>');
                    } else {
                        div.textContent = notif;
                    }
                    list.appendChild(div);
                });
            } catch {
                list.innerHTML = '<div style="color:var(--danger-500); text-align:center; padding:1rem;">Error loading notifications.</div>';
            }
        } else {
            dropdown.style.display = 'none';
        }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

// ================================================================
// SCANNER
// ================================================================
function initScannerControls() {
    document.getElementById('startScanBtn').addEventListener('click', startScanner);
    document.getElementById('stopScanBtn').addEventListener('click', stopScanner);
}

async function startScanner() {
    const video = document.getElementById('webcamVideo');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const placeholder = document.getElementById('cameraPlaceholder');

    placeholder.style.display = 'none';

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
        });
        video.srcObject = webcamStream;
        isScannerRunning = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        showToast('Camera scanner started', 'success');
        scannerInterval = setInterval(processScannerFrame, 400);
    } catch (err) {
        placeholder.style.display = 'flex';
        showToast('Webcam error: ' + err.message, 'danger');
    }
}

function stopScanner() {
    const video = document.getElementById('webcamVideo');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const placeholder = document.getElementById('cameraPlaceholder');
    const canvas = document.getElementById('overlayCanvas');

    if (scannerInterval) clearInterval(scannerInterval);
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }

    video.srcObject = null;
    isScannerRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    placeholder.style.display = 'flex';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showToast('Scanner stopped', 'warning');
}

async function processScannerFrame() {
    if (!isScannerRunning) return;

    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('overlayCanvas');
    const subject = document.getElementById('scanSubject').value;
    const mode = document.getElementById('scanMode').value;
    const markAs = 'auto';
    const livenessThreshold = document.getElementById('livenessThresholdSlider').value;
    const antiSpoof = document.getElementById('scanAntiSpoof').checked;

    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 640;
    offCanvas.height = 480;
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(video, 0, 0, 640, 480);

    const base64Frame = offCanvas.toDataURL('image/jpeg', 0.8);
    totalScanCount++;

    try {
        const response = await fetch('/api/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64Frame,
                subject, mode,
                liveness_threshold: livenessThreshold,
                anti_spoof: antiSpoof,
                mark_as: markAs
            })
        });

        if (!response.ok) return;
        const data = await response.json();

        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (data.results && data.results.length > 0) {
            let markedPresent = false;
            data.results.forEach(res => {
                if (res.status === 'scan_qr_prompt') {
                    drawScannerPrompt(ctx, canvas, res.name);
                } else if (res.status === 'qr_only') {
                    drawScannerPrompt(ctx, canvas, `QR: ${res.roll_number}`);
                } else if (res.status === 'unknown_qr') {
                    drawQrInfoCard(ctx, canvas, {
                        name: 'Unknown QR Code',
                        roll_number: res.roll_number,
                        department: 'N/A',
                        attendance_status: 'Not Found',
                        status: 'unknown_qr'
                    });
                } else if (res.qr_verified && mode === 'qr_only') {
                    // QR-only mode: show rich student info card
                    drawQrInfoCard(ctx, canvas, res);
                    logScanResult(res);
                    if (res.status === 'marked' || res.status === 'already_marked') markedPresent = true;
                } else {
                    drawFaceBoundingBox(ctx, canvas, res);
                    logScanResult(res);
                    if (res.status === 'marked' || res.status === 'already_marked') markedPresent = true;
                }
            });

            if (markedPresent && isScannerRunning) {
                // Stop processing new frames to prevent duplicate successful marks
                if (scannerInterval) clearInterval(scannerInterval);
                scannerInterval = null;
                // Wait 5 seconds to let the user see the success overlay before shutting down camera
                setTimeout(() => {
                    if (isScannerRunning) stopScanner();
                }, 5000);
            }
        }
    } catch (err) {
        console.error('Frame error:', err);
    }
}

function drawScannerPrompt(ctx, canvas, text) {
    ctx.save();
    ctx.fillStyle = 'rgba(59,130,246,0.9)';
    ctx.font = 'bold 12px Inter';
    const w = ctx.measureText(text).width;
    const x = (canvas.width - w) / 2;
    ctx.fillRect(x - 12, 8, w + 24, 26);
    ctx.beginPath();
    ctx.roundRect?.(x - 12, 8, w + 24, 26, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, 25);
    ctx.restore();
}

function drawQrInfoCard(ctx, canvas, res) {
    ctx.save();

    // Card dimensions and position (centered)
    const cardW = Math.min(320, canvas.width - 40);
    const cardH = 140;
    const cardX = (canvas.width - cardW) / 2;
    const cardY = (canvas.height - cardH) / 2;
    const radius = 12;

    // Determine colors based on status
    let statusText = 'Present';
    let statusColor = '#10b981';
    let statusBg = 'rgba(16,185,129,0.15)';
    let headerBg = 'rgba(16,185,129,0.9)';

    if (res.status === 'marked_absent' || res.status === 'already_marked_absent') {
        statusText = 'Absent';
        statusColor = '#ef4444';
        statusBg = 'rgba(239,68,68,0.15)';
        headerBg = 'rgba(239,68,68,0.9)';
    } else if (res.status === 'already_marked') {
        statusText = 'Already Marked';
        statusColor = '#f59e0b';
        statusBg = 'rgba(245,158,11,0.15)';
        headerBg = 'rgba(245,158,11,0.9)';
    } else if (res.status === 'unknown_qr') {
        statusText = 'Not Found';
        statusColor = '#ef4444';
        statusBg = 'rgba(239,68,68,0.15)';
        headerBg = 'rgba(239,68,68,0.9)';
    }

    if (res.attendance_status === 'Present') {
        statusText = res.status === 'already_marked' ? 'Already Present' : 'Present';
    } else if (res.attendance_status === 'Absent') {
        statusText = res.status === 'already_marked_absent' ? 'Already Absent' : 'Absent';
    }

    // Draw card background with rounded corners
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardW, cardH, radius);
    } else {
        ctx.rect(cardX, cardY, cardW, cardH);
    }
    ctx.fill();

    // Card border
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardW, cardH, radius);
    } else {
        ctx.rect(cardX, cardY, cardW, cardH);
    }
    ctx.stroke();

    // Status header bar
    ctx.fillStyle = headerBg;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardW, 32, [radius, radius, 0, 0]);
    } else {
        ctx.fillRect(cardX, cardY, cardW, 32);
    }
    ctx.fill();

    // Status header text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    const icon = statusText.includes('Present') ? '✓' : statusText.includes('Absent') ? '✗' : '⚠';
    ctx.fillText(`${icon}  ${statusText.toUpperCase()}`, cardX + 14, cardY + 21);

    // Student Name
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText(res.name || 'Unknown', cardX + 14, cardY + 58);

    // Roll Number
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`Roll: ${res.roll_number || 'N/A'}`, cardX + 14, cardY + 80);

    // Department
    ctx.fillText(`Dept: ${res.department || 'N/A'}`, cardX + 14, cardY + 98);

    // QR verified badge
    ctx.fillStyle = statusBg;
    const badgeText = 'QR VERIFIED';
    ctx.font = 'bold 10px Inter, sans-serif';
    const badgeW = ctx.measureText(badgeText).width + 16;
    const badgeX = cardX + cardW - badgeW - 12;
    const badgeY = cardY + 44;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(badgeX, badgeY, badgeW, 20, 4);
    } else {
        ctx.fillRect(badgeX, badgeY, badgeW, 20);
    }
    ctx.fill();
    ctx.fillStyle = statusColor;
    ctx.fillText(badgeText, badgeX + 8, badgeY + 14);

    // Timestamp
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(timeStr, cardX + cardW - ctx.measureText(timeStr).width - 14, cardY + 125);

    ctx.restore();
}

function drawFaceBoundingBox(ctx, canvas, res) {
    const { top, right, bottom, left } = res.box;
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;

    const x = left * scaleX;
    const y = top * scaleY;
    const width = (right - left) * scaleX;
    const height = (bottom - top) * scaleY;

    let strokeColor = '#f59e0b';
    if (res.status === 'marked' || res.status === 'already_marked') strokeColor = '#10b981';
    if (res.status === 'marked_absent' || res.status === 'already_marked_absent' || res.status === 'face_mismatch') strokeColor = '#ef4444';
    if (res.status === 'spoof_detected') strokeColor = '#ec4899';

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = strokeColor;
    ctx.font = 'bold 11px Inter';

    let label = res.name;
    if (res.status === 'marked') label += ' ✓ PRESENT';
    if (res.status === 'already_marked') label += ' (ALREADY)';
    if (res.status === 'marked_absent') label += ' ✗ ABSENT';
    if (res.status === 'already_marked_absent') label += ' (ABSENT)';
    if (res.status === 'face_mismatch') label = '⚠ MISMATCH';
    if (res.status === 'spoof_detected') label = '🛡 SPOOF';

    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(x - 1, y - 20, textWidth + 14, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + 5, y - 6);
}

function logScanResult(res) {
    const list = document.getElementById('scanLogsList');

    if (list.children.length === 1 && list.children[0].style.justifyContent === 'center') {
        list.innerHTML = '';
    }

    if (res.status === 'unknown' || res.status === 'face_mismatch') return;
    if (list.children.length > 15) list.removeChild(list.lastChild);

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let statusClass = 'marked', statusLabel = 'Present';
    if (res.status === 'already_marked') { statusClass = 'already_marked'; statusLabel = 'Already'; }
    else if (res.status === 'marked_absent') { statusClass = 'spoof'; statusLabel = 'Absent'; }
    else if (res.status === 'already_marked_absent') { statusClass = 'spoof'; statusLabel = 'Absent'; }
    else if (res.status === 'spoof_detected') { statusClass = 'spoof'; statusLabel = 'Spoof'; }

    // Deduplicate
    const existing = Array.from(list.querySelectorAll('.log-entry'));
    const isDup = existing.some(log => {
        const h4 = log.querySelector('h4');
        const badge = log.querySelector('.log-status');
        return h4 && badge && h4.textContent.includes(res.name) && badge.textContent === statusLabel;
    });
    if (isDup) return;

    const entry = document.createElement('li');
    entry.className = 'log-entry';
    entry.style.animation = 'fadeInUp 0.3s ease forwards';
    entry.innerHTML = `
        <div class="log-info">
            <h4>${res.name}</h4>
            <span>${res.roll_number || 'N/A'} • ${timeStr}</span>
        </div>
        <span class="log-status ${statusClass}">${statusLabel}</span>
    `;
    list.insertBefore(entry, list.firstChild);

    if (res.status === 'marked') showToast(`${res.name} marked Present!`, 'success');
    else if (res.status === 'marked_absent') showToast(`${res.name} toggled Absent`, 'danger');
}

// ================================================================
// STUDENT DIRECTORY
// ================================================================
async function loadStudents() {
    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding:2rem;">Loading...</td></tr>';

    try {
        const response = await fetch('/api/students');
        if (!response.ok) throw new Error('Failed to load students');
        studentsData = await response.json();
        currentPage = 1;
        filterAndRenderStudents();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--danger-500); padding:2rem;">Error: ' + err.message + '</td></tr>';
        showToast(err.message, 'danger');
    }
}

function filterAndRenderStudents() {
    const searchVal = document.getElementById('studentSearchInput').value.toLowerCase();
    const deptFilter = document.getElementById('studentDeptFilter').value;
    const currentFilter = window.currentStudentFilter || 'all';

    let filtered = studentsData.filter(s => {
        const matchSearch = !searchVal || `${s.name} ${s.roll_number} ${s.department}`.toLowerCase().includes(searchVal);
        const matchDept = !deptFilter || s.department === deptFilter;
        let matchDrillDown = true;

        if (currentFilter === 'present') {
            matchDrillDown = s.today_status === 'Present';
        } else if (currentFilter === 'absent') {
            matchDrillDown = s.today_status === 'Absent';
        } else if (currentFilter === 'at-risk') {
            matchDrillDown = s.is_at_risk;
        }

        return matchSearch && matchDept && matchDrillDown;
    });

    renderStudentTable(filtered);
    renderPagination(filtered.length);
}

function renderStudentTable(filtered) {
    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding:2rem;">No students found</td></tr>';
        return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageData = filtered.slice(start, end);

    pageData.forEach(s => {
        const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const avatarHtml = s.image_path
            ? `<div class="student-avatar"><img src="/${s.image_path}" alt="${s.name}"></div>`
            : `<div class="student-avatar">${initials}</div>`;

        // Today's Status Badge
        const todayStatusClass = s.today_status === 'Present' ? 'success' : 'danger';
        const todayStatusIcon = s.today_status === 'Present' ? '✓' : '✗';
        const checkInText = s.today_status === 'Present' && s.check_in_time ? `<br><small style="color:var(--text-tertiary);">${s.check_in_time}</small>` : '';

        const attendanceClass = s.is_at_risk ? 'danger' : 'success';
        const attendanceWarning = s.is_at_risk ? ' <i class="fa-solid fa-triangle-exclamation" style="font-size:0.65rem;"></i>' : '';

        const parentInfo = `${s.parent_email || '<span style="color:var(--text-tertiary)">No email</span>'}<br><small style="color:var(--text-tertiary);">${s.parent_phone || 'No phone'}</small>`;

        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>
                <div class="student-cell">
                    ${avatarHtml}
                    <div>
                        <div style="font-weight:600;">${s.name}</div>
                        <div style="font-size:0.72rem; color:var(--text-tertiary);">${s.email || ''}</div>
                    </div>
                </div>
            </td>
            <td><b>${s.roll_number}</b></td>
            <td>${s.department || 'N/A'}</td>
            <td>
                <span class="badge ${todayStatusClass}">${todayStatusIcon} ${s.today_status}</span>
                ${checkInText}
            </td>
            <td><span class="badge ${attendanceClass}">${s.attendance_rate}%${attendanceWarning}</span></td>
            <td style="text-align:center;">
                <div style="display:inline-flex; gap:0.3rem;">
                    <button class="btn-icon" onclick="openQrModal('${s.roll_number}', '${s.name}')" title="QR Code">
                        <i class="fa-solid fa-qrcode"></i>
                    </button>
                    <button class="btn-icon" onclick="openEditStudentModal(${s.id})" title="Edit Student">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-icon" onclick="openFaceRegisterModal(${s.id}, '${s.name}')" title="Register Face">
                        <i class="fa-solid fa-camera"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteStudent(${s.id})" title="Delete" style="color:var(--danger-500);">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

}

function renderPagination(totalItems) {
    const info = document.getElementById('paginationInfo');
    const controls = document.getElementById('paginationControls');
    const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;

    const start = Math.min((currentPage - 1) * PAGE_SIZE + 1, totalItems);
    const end = Math.min(currentPage * PAGE_SIZE, totalItems);
    info.textContent = totalItems > 0 ? `Showing ${start}–${end} of ${totalItems} students` : 'No students';

    controls.innerHTML = '';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; filterAndRenderStudents(); };
    controls.appendChild(prevBtn);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 5 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
            if (i === 3 || i === totalPages - 2) {
                const dots = document.createElement('span');
                dots.textContent = '…';
                dots.style.padding = '0 0.3rem';
                dots.style.color = 'var(--text-tertiary)';
                controls.appendChild(dots);
            }
            continue;
        }
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => { currentPage = i; filterAndRenderStudents(); };
        controls.appendChild(pageBtn);
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; filterAndRenderStudents(); };
    controls.appendChild(nextBtn);
}

// Student search + filter event listeners
document.getElementById('studentSearchInput').addEventListener('input', () => {
    currentPage = 1;
    filterAndRenderStudents();
});

document.getElementById('studentDeptFilter').addEventListener('change', () => {
    currentPage = 1;
    filterAndRenderStudents();
});

// ================================================================
// STUDENT CRUD
// ================================================================
function openAddStudentModal() {
    document.getElementById('addStudentModal').style.display = 'flex';
}

function closeAddStudentModal() {
    document.getElementById('addStudentModal').style.display = 'none';
    document.getElementById('addStudentForm').reset();
}

function openEditStudentModal(studentId) {
    const s = studentsData.find(st => st.id === studentId);
    if (!s) return;
    
    document.getElementById('editStudentId').value = s.id;
    document.getElementById('editStudentRoll').value = s.roll_number || '';
    document.getElementById('editStudentName').value = s.name || '';
    document.getElementById('editStudentEmail').value = s.email || '';
    document.getElementById('editStudentDept').value = s.department || 'Computer Science';
    document.getElementById('editStudentParentEmail').value = s.parent_email || '';
    document.getElementById('editStudentParentPhone').value = s.parent_phone || '';
    
    document.getElementById('editStudentModal').style.display = 'flex';
}

function closeEditStudentModal() {
    document.getElementById('editStudentModal').style.display = 'none';
    document.getElementById('editStudentForm').reset();
}

function initForms() {
    document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const roll = document.getElementById('addStudentRoll').value;
        const name = document.getElementById('addStudentName').value;
        const email = document.getElementById('addStudentEmail').value;
        const dept = document.getElementById('addStudentDept').value;
        const parentEmail = document.getElementById('addStudentParentEmail').value;
        const parentPhone = document.getElementById('addStudentParentPhone').value;

        try {
            const response = await fetch('/api/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roll_number: roll, name, email, department: dept, parent_email: parentEmail, parent_phone: parentPhone })
            });
            const result = await response.json();
            if (response.ok) {
                showToast('Student created successfully!', 'success');
                closeAddStudentModal();
                loadStudents();
            } else {
                showToast(result.error || 'Failed to create student', 'danger');
            }
        } catch {
            showToast('Connection error', 'danger');
        }
    });

    document.getElementById('editStudentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editStudentId').value;
        const roll = document.getElementById('editStudentRoll').value;
        const name = document.getElementById('editStudentName').value;
        const email = document.getElementById('editStudentEmail').value;
        const dept = document.getElementById('editStudentDept').value;
        const parentEmail = document.getElementById('editStudentParentEmail').value;
        const parentPhone = document.getElementById('editStudentParentPhone').value;

        try {
            const response = await fetch(`/api/students/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roll_number: roll, name, email, department: dept, parent_email: parentEmail, parent_phone: parentPhone })
            });
            const result = await response.json();
            if (response.ok) {
                showToast('Student updated successfully!', 'success');
                closeEditStudentModal();
                loadStudents();
            } else {
                showToast(result.error || 'Failed to update student', 'danger');
            }
        } catch {
            showToast('Connection error', 'danger');
        }
    });
}

async function deleteStudent(studentId) {
    if (!confirm('Are you sure you want to delete this student and their facial data?')) return;
    try {
        const response = await fetch(`/api/students/${studentId}`, { method: 'DELETE' });
        const result = await response.json();
        if (response.ok) {
            showToast('Student deleted', 'success');
            loadStudents();
        } else {
            showToast(result.error || 'Failed to delete', 'danger');
        }
    } catch {
        showToast('Connection error', 'danger');
    }
}

// ================================================================
// FACE REGISTRATION
// ================================================================
async function openFaceRegisterModal(studentId, studentName) {
    currentRegisterStudentId = studentId;
    document.getElementById('registerFaceStudentName').innerHTML = `Student: <b>${studentName}</b>`;
    document.getElementById('faceRegisterModal').style.display = 'flex';

    const video = document.getElementById('registerVideo');
    const placeholder = document.getElementById('registerVideoPlaceholder');
    placeholder.style.display = 'flex';

    try {
        registerStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = registerStream;
        placeholder.style.display = 'none';
        document.getElementById('captureFaceBtn').onclick = captureFaceImage;
    } catch (err) {
        showToast('Camera error: ' + err.message, 'danger');
    }
}

function closeFaceRegisterModal() {
    document.getElementById('faceRegisterModal').style.display = 'none';
    if (registerStream) {
        registerStream.getTracks().forEach(track => track.stop());
        registerStream = null;
    }
    document.getElementById('registerVideo').srcObject = null;
    currentRegisterStudentId = null;
}

async function captureFaceImage() {
    if (!currentRegisterStudentId) return;
    const video = document.getElementById('registerVideo');
    const btn = document.getElementById('captureFaceBtn');

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        showToast('Video not ready', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvas.getContext('2d').drawImage(video, 0, 0, 640, 480);

    try {
        const response = await fetch(`/api/students/${currentRegisterStudentId}/register-face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.9) })
        });
        const result = await response.json();
        if (response.ok) {
            showToast('Face registered successfully!', 'success');
            closeFaceRegisterModal();
            loadStudents();
        } else {
            showToast(result.error || 'Registration failed', 'danger');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-camera"></i> Capture';
        }
    } catch {
        showToast('Connection error', 'danger');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-camera"></i> Capture';
    }
}

// ================================================================
// QR CODE
// ================================================================
function openQrModal(rollNumber, name) {
    const modal = document.getElementById('studentQrModal');
    const qrContainer = document.getElementById('qrModalCanvas');
    const subtitle = document.getElementById('qrModalSubtitle');
    const title = document.getElementById('qrModalTitle');
    const downloadBtn = document.getElementById('downloadQrBtn');

    title.innerHTML = `QR: <b>${name}</b>`;
    subtitle.innerHTML = `Roll: <b>${rollNumber}</b>`;

    // Clear previous QR code
    qrContainer.innerHTML = '';

    // Generate QR code client-side using qrcode.js
    new QRCode(qrContainer, {
        text: rollNumber,
        width: 180,
        height: 180,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    // Download button: export the canvas as PNG
    downloadBtn.onclick = () => {
        // qrcode.js creates a canvas inside the container
        const canvas = qrContainer.querySelector('canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = `${rollNumber}_${name}_QR.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
    };

    modal.style.display = 'flex';
}

function closeQrModal() {
    document.getElementById('studentQrModal').style.display = 'none';
}

// ================================================================
// REPORTS
// ================================================================
async function loadReportData() {
    const tbody = document.getElementById('reportsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:2rem;">Loading records...</td></tr>';

    const subject = document.getElementById('reportFilterSubject').value;
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    let url = '/api/attendance?';
    if (subject) url += `subject=${encodeURIComponent(subject)}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load records');
        const logs = await response.json();

        tbody.innerHTML = '';
        document.getElementById('reportRecordCount').textContent = `${logs.length} records found`;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:2rem;">No records match filters</td></tr>';
            return;
        }

        logs.forEach(log => {
            const date = new Date(log.timestamp);
            const formattedDate = date.toLocaleString();
            const badgeClass = log.status === 'Present' ? 'success' : 'danger';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formattedDate}</td>
                <td><b>${log.roll_number}</b></td>
                <td>${log.name}</td>
                <td>${log.department || 'N/A'}</td>
                <td>${log.subject}</td>
                <td><span class="badge ${badgeClass}">${log.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function clearReportFilters() {
    document.getElementById('reportFilterSubject').value = '';
    document.getElementById('reportStartDate').value = '';
    document.getElementById('reportEndDate').value = '';
    loadReportData();
}

function exportReport(format) {
    const subject = document.getElementById('reportFilterSubject').value;
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    let url = `/api/reports/${format}?`;
    if (subject) url += `subject=${encodeURIComponent(subject)}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;

    window.location.href = url;
}

function exportCSV() {
    // Client-side CSV from currently displayed report data
    const table = document.getElementById('reportsTable');
    const rows = table.querySelectorAll('tr');
    let csv = [];

    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = Array.from(cols).map(col => `"${col.textContent.trim()}"`);
        if (rowData.length > 0) csv.push(rowData.join(','));
    });

    if (csv.length <= 1) {
        showToast('No data to export', 'warning');
        return;
    }

    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
}
