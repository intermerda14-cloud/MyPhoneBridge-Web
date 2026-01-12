// Global state
let currentUserId = null;
let cameraStreamListener = null;

// DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const btnLogin = document.getElementById('btnLogin');
const btnGoogleLogin = document.getElementById('btnGoogleLogin');
const btnSignOut = document.getElementById('btnSignOut');

const dashboardSection = document.getElementById('dashboardSection');
const pairingSection = document.getElementById('pairingSection');
const displayPairCode = document.getElementById('displayPairCode');
const btnRefreshCode = document.getElementById('btnRefreshCode');

const resultPanel = document.getElementById('resultPanel');
const resultContent = document.getElementById('resultContent');
const streamPanel = document.getElementById('streamPanel');
const streamInfo = document.getElementById('streamInfo');
const cameraStreamImage = document.getElementById('cameraStreamImage');
const btnStopStream = document.getElementById('btnStopStream');

const statusText = document.getElementById('statusText');
const batteryStatus = document.getElementById('batteryStatus');
const pairCodeDisplay = document.getElementById('pairCode');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkExistingSession();
    setupEventListeners();
});

function checkExistingSession() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUserId = user.uid;
            checkIfPaired();
        } else {
            showLogin();
        }
    });
}

function setupEventListeners() {
    btnLogin?.addEventListener('click', signIn);
    btnGoogleLogin?.addEventListener('click', signInWithGoogle);
    btnSignOut?.addEventListener('click', signOut);
    btnRefreshCode?.addEventListener('click', generateNewPairCode);
    btnStopStream?.addEventListener('click', stopCameraStream);
    
    // SMS Modal
    document.getElementById('btnSendSmsSubmit')?.addEventListener('click', () => {
        const phone = document.getElementById('smsPhoneNumber').value.trim();
        const message = document.getElementById('smsMessage').value.trim();
        if (phone && message) {
            sendCommand('send_sms', { phoneNumber: phone, message });
            bootstrap.Modal.getInstance(document.getElementById('smsModal')).hide();
        }
    });
    
    // URL Modal
    document.getElementById('btnSendUrl')?.addEventListener('click', () => {
        const url = document.getElementById('urlInput').value.trim();
        if (url) {
            sendCommand('open_url', { url });
            bootstrap.Modal.getInstance(document.getElementById('urlModal')).hide();
        }
    });
}

// ========== AUTH ==========

async function signIn() {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    if (!email || !password) {
        showError('Please enter email and password');
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        showError(error.message);
    }
}

async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
            showError(error.message);
        }
    }
}

async function signOut() {
    try {
        await auth.signOut();
        showLogin();
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

function showError(message) {
    if (loginError) {
        loginError.textContent = message;
        loginError.classList.remove('d-none');
    }
}

// ========== UI STATES ==========

function showLogin() {
    loginOverlay?.classList.remove('d-none');
    dashboardSection?.classList.add('d-none');
    pairingSection?.classList.add('d-none');
}

function showPairing() {
    loginOverlay?.classList.add('d-none');
    dashboardSection?.classList.add('d-none');
    pairingSection?.classList.remove('d-none');
    generateNewPairCode();
}

function showDashboard() {
    loginOverlay?.classList.add('d-none');
    pairingSection?.classList.add('d-none');
    dashboardSection?.classList.remove('d-none');
    loadPairCode();
    updateBatteryStatus();
}

// ========== PAIRING ==========

async function checkIfPaired() {
    try {
        const deviceDoc = await firestore.collection('devices')
            .where('userId', '==', currentUserId)
            .where('isPaired', '==', true)
            .limit(1)
            .get();
        
        if (!deviceDoc.empty) {
            showDashboard();
        } else {
            showPairing();
        }
    } catch (error) {
        console.error('Check paired error:', error);
        showPairing();
    }
}

async function generateNewPairCode() {
    if (!currentUserId) return;
    
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await firestore.collection('users').doc(currentUserId).set({
            pairCode: code,
            email: auth.currentUser.email,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        if (displayPairCode) {
            displayPairCode.textContent = code;
        }
        
        listenForPairing();
    } catch (error) {
        console.error('Generate code error:', error);
    }
}

function listenForPairing() {
    if (!currentUserId) return;
    
    firestore.collection('devices')
        .where('userId', '==', currentUserId)
        .where('isPaired', '==', true)
        .onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                showDashboard();
            }
        });
}

async function loadPairCode() {
    if (!currentUserId) return;
    
    try {
        const userDoc = await firestore.collection('users').doc(currentUserId).get();
        const code = userDoc.data()?.pairCode || '------';
        if (pairCodeDisplay) {
            pairCodeDisplay.textContent = 'Pair Code: ' + code;
        }
    } catch (error) {
        console.error('Load pair code error:', error);
    }
}

// ========== COMMANDS ==========

async function sendCommand(type, data) {
    if (!currentUserId) {
        alert('Not logged in');
        return null;
    }
    
    setStatus('Sending command...', 'info');
    
    try {
        const commandRef = await firestore
            .collection('users')
            .doc(currentUserId)
            .collection('commands')
            .add({
                type,
                data,
                status: 'pending',
                timestamp: Date.now()
            });
        
        // Wait for result
        return await waitForResult(commandRef);
        
    } catch (error) {
        console.error('Send command error:', error);
        setStatus('Error: ' + error.message, 'danger');
        return null;
    }
}

async function waitForResult(commandRef) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe();
            setStatus('Command timeout', 'danger');
            reject(new Error('Timeout'));
        }, 30000);
        
        const unsubscribe = commandRef.onSnapshot((doc) => {
            const data = doc.data();
            if (data.status === 'completed') {
                clearTimeout(timeout);
                unsubscribe();
                setStatus('Command completed', 'success');
                showResult(data.result);
                resolve(data.result);
            } else if (data.status === 'failed') {
                clearTimeout(timeout);
                unsubscribe();
                setStatus('Command failed: ' + data.error, 'danger');
                reject(new Error(data.error));
            }
        });
    });
}

function setStatus(message, type = 'info') {
    if (statusText) {
        statusText.textContent = message;
        statusText.className = `text-muted small text-${type}`;
    }
}

// ========== RESULT DISPLAY ==========

function showResult(result) {
    if (!resultPanel || !resultContent) return;
    
    // Special handling for file lists
    if (result.files && Array.isArray(result.files)) {
        let html = `<div class="mb-3">
            <strong>Path:</strong> <code>${result.path}</code>
            <span class="badge bg-primary ms-2">${result.count} items</span>
        </div>`;
        html += '<div class="list-group">';
        result.files.forEach(file => {
            const icon = file.isDirectory ? '📁' : '📄';
            const size = file.isDirectory ? '' : ` <span class="badge bg-secondary">${formatFileSize(file.size)}</span>`;
            const action = file.isDirectory 
                ? `onclick="sendCommand('list_files', { path: '${file.path}' })"` 
                : `onclick="sendCommand('download_file', { path: '${file.path}' })"`;
            html += `<a href="#" class="list-group-item list-group-item-action" ${action}>
                ${icon} ${file.name}${size}
            </a>`;
        });
        html += '</div>';
        resultContent.innerHTML = html;
        resultPanel.classList.add('show');
        return;
    }
    
    // Special handling for downloads
    if (result.data && result.filename) {
        const isImage = result.mimeType?.startsWith('image/');
        let html = `<h6>${result.filename} <span class="badge bg-info">${formatFileSize(result.size)}</span></h6>`;
        if (isImage) {
            html += `<img src="data:${result.mimeType};base64,${result.data}" class="img-fluid mb-3">`;
        }
        html += `<a href="data:${result.mimeType};base64,${result.data}" download="${result.filename}" class="btn btn-primary">
            <i class="bi bi-download"></i> Download
        </a>`;
        resultContent.innerHTML = html;
        resultPanel.classList.add('show');
        return;
    }
    
    // Special handling for location
    if (result.mapsUrl) {
        let html = `<p><strong>Location:</strong> ${result.latitude}, ${result.longitude}</p>`;
        html += `<a href="${result.mapsUrl}" target="_blank" class="btn btn-primary">
            <i class="bi bi-map"></i> Open in Google Maps
        </a>`;
        resultContent.innerHTML = html;
        resultPanel.classList.add('show');
        return;
    }
    
    // Default JSON display
    resultContent.innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
    resultPanel.classList.add('show');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// ========== CAMERA STREAM ==========

async function startCameraStream(camera) {
    if (!currentUserId) return;
    
    streamPanel?.classList.add('show');
    streamInfo.textContent = `Starting ${camera} camera...`;
    
    try {
        const result = await sendCommand('start_camera_stream', { camera });
        
        if (!result || result.message !== "Camera stream started") {
            throw new Error('Failed to start stream');
        }
        
        // Listen for frames
        const database = firebase.database();
        const streamRef = database.ref(`camera_streams/${currentUserId}`);
        
        cameraStreamListener = streamRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.frame && data.active) {
                cameraStreamImage.src = `data:image/jpeg;base64,${data.frame}`;
                const time = new Date(data.timestamp).toLocaleTimeString();
                streamInfo.innerHTML = `<span class="badge bg-success">● LIVE</span> Frame ${data.frameNumber} | ${camera} | ${time}`;
            } else if (data && !data.active) {
                stopCameraStream();
            }
        });
        
    } catch (error) {
        console.error('Stream error:', error);
        streamPanel?.classList.remove('show');
    }
}

async function stopCameraStream() {
    if (!currentUserId) return;
    
    try {
        if (cameraStreamListener) {
            const database = firebase.database();
            database.ref(`camera_streams/${currentUserId}`).off('value', cameraStreamListener);
            cameraStreamListener = null;
        }
        
        await sendCommand('stop_camera_stream', {});
        streamPanel?.classList.remove('show');
        
    } catch (error) {
        console.error('Stop stream error:', error);
    }
}

// ========== BATTERY STATUS ==========

async function updateBatteryStatus() {
    if (!currentUserId) return;
    
    try {
        const result = await sendCommand('get_battery_info', {});
        if (result && batteryStatus) {
            const icon = result.isCharging ? 'battery-charging' : 'battery-full';
            batteryStatus.innerHTML = `<i class="bi bi-${icon}"></i> ${result.percentage}%`;
        }
    } catch (error) {
        console.error('Battery update error:', error);
    }
}

// Auto-update battery every 5 minutes
setInterval(() => {
    if (currentUserId && dashboardSection && !dashboardSection.classList.contains('d-none')) {
        updateBatteryStatus();
    }
}, 5 * 60 * 1000);
