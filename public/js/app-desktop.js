// Global variables
let currentUserId = null;
let currentCamera = 'front';
let streamListener = null;

// Setup event listeners
function setupEventListeners() {
    // Auth buttons
    document.getElementById('btnLogin')?.addEventListener('click', signIn);
    document.getElementById('btnGoogleLogin')?.addEventListener('click', signInWithGoogle);
    document.getElementById('btnSignOut')?.addEventListener('click', signOut);

    // Sidebar navigation
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            switchSection(section);
        });
    });

    // Camera controls
    document.querySelectorAll('.camera-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.camera-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCamera = btn.dataset.camera;
        });
    });

    document.getElementById('btnStartStream')?.addEventListener('click', () => startCameraStream(currentCamera));
    document.getElementById('btnStopStream')?.addEventListener('click', () => stopCameraStream()); // <-- FIXED: Add arrow function

    // Quick actions
    document.getElementById('btnRingPhone')?.addEventListener('click', ringPhone);
    document.getElementById('btnGetLocation')?.addEventListener('click', getLocation);
    document.getElementById('btnGetMessages')?.addEventListener('click', getMessages);
    document.getElementById('btnGetCallLogs')?.addEventListener('click', getCallLogs);
    document.getElementById('btnGetFiles')?.addEventListener('click', () => listFiles('/storage/emulated/0'));

    // Modals
    document.getElementById('btnSendSMS')?.addEventListener('click', sendSMS);
    document.getElementById('btnOpenURL')?.addEventListener('click', openURL);

    // Result panel
    document.getElementById('btnCloseResult')?.addEventListener('click', () => {
        document.getElementById('resultPanel').style.display = 'none';
    });
}

// Switch sections
function switchSection(section) {
    // Update sidebar
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

    // Update content
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(`${section}Section`)?.classList.add('active');
}

// Auth functions
async function signIn() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
    } catch (error) {
        alert('Google login failed: ' + error.message);
    }
}

async function signOut() {
    try {
        await auth.signOut();
        location.reload();
    } catch (error) {
        alert('Sign out failed: ' + error.message);
    }
}

// Auth state listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUserId = user.uid;
        console.log('User logged in:', currentUserId);

        // Hide login, show desktop
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('desktopContainer').style.display = 'flex';

        // Auto-update battery (wait 2 seconds for device to register)
        setTimeout(updateBatteryStatus, 2000);
        setInterval(updateBatteryStatus, 5 * 60 * 1000);

    } else {
        currentUserId = null;
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('desktopContainer').style.display = 'none';
    }
});

// Send command function
async function sendCommand(type, data = {}) {
    if (!currentUserId) {
        alert('Not logged in');
        return null;
    }

    try {
        const commandRef = firestore.collection('users')
            .doc(currentUserId)
            .collection('commands')
            .doc();

        await commandRef.set({
            type: type,
            data: data,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('Command sent:', type);

        // Wait for result
        return await waitForResult(commandRef);

    } catch (error) {
        console.error('Send command error:', error);
        showResult({ error: error.message });
        return null;
    }
}

async function waitForResult(commandRef, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            unsubscribe();
            reject(new Error('Timeout'));
        }, timeout);

        const unsubscribe = commandRef.onSnapshot((doc) => {
            const data = doc.data();
            if (data && data.status === 'completed') {
                clearTimeout(timer);
                unsubscribe();
                resolve(data.result);
            }
        });
    });
}

// Camera streaming
async function startCameraStream(camera) {

    async function stopCameraStream() {
        try {
            // Stop listening
            if (streamListener) {
                const database = firebase.database(firebase.app(), 'https://myphonebridge-default-rtdb.asia-southeast1.firebasedatabase.app');
                const streamRef = database.ref(`camera_streams/${currentUserId}`);
                streamRef.off('value', streamListener);
                streamListener = null;
            }

            const result = await sendCommand('stop_camera_stream');

            // Reset UI
            document.querySelector('.stream-placeholder').style.display = 'block';
            document.getElementById('cameraStreamImage').style.display = 'none';
            document.getElementById('streamInfo').style.display = 'none';
            document.getElementById('btnStartStream').style.display = 'inline-block';
            document.getElementById('btnStopStream').style.display = 'none';

            showResult(result);
        } catch (error) {
            console.error('Stop stream error:', error);
        }
    }
}

// Quick actions
async function ringPhone() {
    const result = await sendCommand('ring_phone');
    showResult(result);
}

async function getLocation() {
    const result = await sendCommand('get_location');
    if (result && result.latitude && result.longitude) {
        const mapsUrl = `https://www.google.com/maps?q=${result.latitude},${result.longitude}`;
        result.mapsLink = `<a href="${mapsUrl}" target="_blank" class="btn btn-primary btn-sm mt-2">
            <i class="bi bi-map"></i> Open in Google Maps
        </a>`;
    }
    showResult(result);
}

async function getMessages() {
    const result = await sendCommand('read_sms');
    showResult(result);
}

async function getCallLogs() {
    const result = await sendCommand('get_call_logs');
    showResult(result);
}

async function listFiles(path) {
    const result = await sendCommand('list_files', { path });
    if (result && result.files) {
        displayFiles(result.files, path);
    } else {
        showResult(result);
    }
}

async function sendSMS() {
    const phone = document.getElementById('smsPhoneNumber').value;
    const message = document.getElementById('smsMessage').value;

    if (!phone || !message) {
        alert('Please fill in all fields');
        return;
    }

    const result = await sendCommand('send_sms', { phoneNumber: phone, message });
    showResult(result);

    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('smsModal'))?.hide();
}

async function openURL() {
    const url = document.getElementById('urlInput').value;

    if (!url) {
        alert('Please enter a URL');
        return;
    }

    const result = await sendCommand('open_url', { url });
    showResult(result);

    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('urlModal'))?.hide();
}

// Display functions
function displayFiles(files, currentPath) {
    const container = document.getElementById('filesContent');

    let html = `<div class="mb-3"><strong>Path:</strong> ${currentPath}</div>`;
    html += '<div class="list-group">';

    files.forEach(file => {
        const icon = file.isDirectory ? 'bi-folder-fill' : 'bi-file-earmark';
        const color = file.isDirectory ? 'text-warning' : 'text-primary';

        html += `
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                 onclick="${file.isDirectory ? `listFiles('${file.path}')` : `downloadFile('${file.path}')`}"
                 style="cursor: pointer;">
                <div>
                    <i class="bi ${icon} ${color}"></i>
                    <span class="ms-2">${file.name}</span>
                </div>
                <span class="badge bg-secondary">${formatFileSize(file.size)}</span>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

async function downloadFile(path) {
    const result = await sendCommand('download_file', { path });
    if (result && result.data) {
        // Show preview if image
        if (result.mimeType && result.mimeType.startsWith('image/')) {
            const img = `<img src="data:${result.mimeType};base64,${result.data}" class="img-fluid mb-3">`;
            result.preview = img;
        }

        // Add download button
        result.downloadBtn = `
            <a href="data:${result.mimeType};base64,${result.data}" 
               download="${result.fileName}" 
               class="btn btn-primary btn-sm">
                <i class="bi bi-download"></i> Download ${result.fileName}
            </a>
        `;
    }
    showResult(result);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function updateBatteryStatus() {
    if (!currentUserId) return; // Don't run if not logged in

    try {
        const result = await sendCommand('get_battery_info');
        if (result && result.level !== undefined) {
            const icon = result.isCharging ? 'bi-battery-charging' : 'bi-battery-full';
            document.getElementById('batteryStatus').innerHTML = `
                <i class="bi ${icon}"></i>
                <span>${result.level}%</span>
            `;
        }
    } catch (error) {
        console.error('Battery update error:', error);
    }
}

// Show result panel
function showResult(result) {
    const panel = document.getElementById('resultPanel');
    const content = document.getElementById('resultContent');

    if (!result) {
        content.innerHTML = '<div class="alert alert-warning">No result</div>';
    } else if (result.error) {
        content.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
    } else if (result.preview) {
        content.innerHTML = result.preview + (result.downloadBtn || '');
    } else if (result.mapsLink) {
        content.innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>${result.mapsLink}`;
    } else if (result.downloadBtn) {
        content.innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>${result.downloadBtn}`;
    } else {
        content.innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
    }

    panel.style.display = 'block';
}

// Initialize
setupEventListeners();
