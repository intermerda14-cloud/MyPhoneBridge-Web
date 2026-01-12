// Global state
let currentUserId = null;
let deviceListener = null;

// DOM Elements
const loginSection = document.getElementById('loginSection');
const pairingSection = document.getElementById('pairingSection');
const dashboardSection = document.getElementById('dashboardSection');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const btnLogin = document.getElementById('btnLogin');
const btnLoginText = document.getElementById('btnLoginText');
const btnLoginSpinner = document.getElementById('btnLoginSpinner');
const loginError = document.getElementById('loginError');

const pairingCodeInput = document.getElementById('pairingCodeInput');
const btnPair = document.getElementById('btnPair');
const btnPairText = document.getElementById('btnPairText');
const btnPairSpinner = document.getElementById('btnPairSpinner');
const pairingError = document.getElementById('pairingError');
const userEmail = document.getElementById('userEmail');
const btnSignOut = document.getElementById('btnSignOut');
const btnUnpair = document.getElementById('btnUnpair');

const deviceStatus = document.getElementById('deviceStatus');
const dashboardUserEmail = document.getElementById('dashboardUserEmail');
const deviceName = document.getElementById('deviceName');
const lastOnline = document.getElementById('lastOnline');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkExistingSession();
    setupEventListeners();
    setupCommandButtons();
});

// Check if user is already logged in
function checkExistingSession() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUserId = user.uid;
            checkIfPaired();
        } else {
            showLoginSection();
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Login with Enter key
    loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            signIn();
        }
    });

    // Login button
    btnLogin.addEventListener('click', signIn);

    // Google Sign-In button
    document.getElementById('btnGoogleLogin')?.addEventListener('click', signInWithGoogle);

    // Sign out button
    btnSignOut.addEventListener('click', signOut);

    // Pairing code input (only numbers)
    pairingCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        pairingError.classList.add('d-none');
    });

    // Pair with Enter key
    pairingCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && pairingCodeInput.value.length === 6) {
            pairDevice();
        }
    });

    // Pair button
    btnPair.addEventListener('click', pairDevice);

    // Unpair button
    btnUnpair.addEventListener('click', unpairDevice);
}

// Sign in with email/password
async function signIn() {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
        showLoginError('Please enter email and password');
        return;
    }

    setLoginLoading(true);
    loginError.classList.add('d-none');

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error('Login error:', error);
        showLoginError(getErrorMessage(error.code));
        setLoginLoading(false);
    }
}

// Sign in with Google
async function signInWithGoogle() {
    loginError.classList.add('d-none');
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error('Google sign-in error:', error);
        
        // Handle popup closed by user
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            return; // Don't show error, user just cancelled
        }
        
        showLoginError(getErrorMessage(error.code));
    }
}

// Sign out
async function signOut() {
    if (confirm('Are you sure you want to sign out?')) {
        if (deviceListener) {
            deviceListener();
            deviceListener = null;
        }
        await auth.signOut();
        currentUserId = null;
        showLoginSection();
    }
}

// Check if user already has a paired device
async function checkIfPaired() {
    try {
        const deviceDoc = await firestore.collection('users')
            .doc(currentUserId)
            .collection('devices')
            .doc('primary')
            .get();

        if (deviceDoc.exists && deviceDoc.data().isPaired) {
            // Already paired, show dashboard
            showDashboard();
            loadDeviceInfo();
        } else {
            // Not paired, show pairing section
            showPairingSection();
        }
    } catch (error) {
        console.error('Error checking paired status:', error);
        showPairingSection();
    }
}

// Pair device with code
async function pairDevice() {
    const code = pairingCodeInput.value.trim();

    if (code.length !== 6) {
        showPairingError('Please enter a 6-digit code');
        return;
    }

    setPairingLoading(true);
    pairingError.classList.add('d-none');

    try {
        // Query for device with matching pairing code
        const snapshot = await firestore.collectionGroup('devices')
            .where('pairCode', '==', code)
            .where('isPaired', '==', false)
            .get();

        if (snapshot.empty) {
            showPairingError('Invalid or expired pairing code');
            setPairingLoading(false);
            return;
        }

        const deviceDoc = snapshot.docs[0];
        const pairExpiry = deviceDoc.data().pairExpiry.toDate();
        const now = new Date();

        // Check if code expired
        if (pairExpiry < now) {
            showPairingError('Pairing code has expired. Generate a new one.');
            setPairingLoading(false);
            return;
        }

        // Check if the device belongs to current user
        const deviceUserId = deviceDoc.ref.parent.parent.id;
        if (deviceUserId !== currentUserId) {
            showPairingError('This pairing code belongs to a different account');
            setPairingLoading(false);
            return;
        }

        // Mark as paired
        await deviceDoc.ref.update({ isPaired: true });

        // Show dashboard
        showDashboard();
        loadDeviceInfo();

    } catch (error) {
        console.error('Pairing error:', error);
        showPairingError('Failed to pair device: ' + error.message);
        setPairingLoading(false);
    }
}

// Unpair device
async function unpairDevice() {
    if (confirm('Are you sure you want to unpair this device?')) {
        try {
            // Stop listening
            if (deviceListener) {
                deviceListener();
                deviceListener = null;
            }

            // Update Firestore
            await firestore.collection('users')
                .doc(currentUserId)
                .collection('devices')
                .doc('primary')
                .update({ isPaired: false });

            // Show pairing screen
            showPairingSection();
            pairingCodeInput.value = '';

        } catch (error) {
            console.error('Unpair error:', error);
            alert('Failed to unpair device: ' + error.message);
        }
    }
}

// Load device info and start listening
function loadDeviceInfo() {
    if (!currentUserId) return;

    const deviceRef = firestore.collection('users')
        .doc(currentUserId)
        .collection('devices')
        .doc('primary');

    // Listen for real-time updates
    deviceListener = deviceRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            updateDeviceUI(data);
        } else {
            alert('Device not found');
            showPairingSection();
        }
    }, (error) => {
        console.error('Error listening to device:', error);
    });
}

// Update device UI
function updateDeviceUI(data) {
    // User email
    const user = auth.currentUser;
    dashboardUserEmail.textContent = user.email || 'Unknown';

    // Device name
    deviceName.textContent = data.name || 'Unknown Device';

    // Last online
    const lastOnlineTime = data.lastOnline;
    if (lastOnlineTime) {
        const now = Date.now();
        const diff = now - lastOnlineTime;

        // Check if online (within last 60 seconds)
        if (diff < 60000) {
            deviceStatus.textContent = 'Online';
            deviceStatus.className = 'badge bg-online';
            lastOnline.textContent = 'Just now';
        } else {
            deviceStatus.textContent = 'Offline';
            deviceStatus.className = 'badge bg-offline';
            lastOnline.textContent = formatTimeAgo(new Date(lastOnlineTime));
        }
    } else {
        deviceStatus.textContent = 'Unknown';
        deviceStatus.className = 'badge bg-secondary';
        lastOnline.textContent = '-';
    }
}

// Format time ago
function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return seconds + ' seconds ago';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    return Math.floor(seconds / 86400) + ' days ago';
}

// Show/hide sections
function showLoginSection() {
    loginSection.classList.remove('d-none');
    pairingSection.classList.add('d-none');
    dashboardSection.classList.add('d-none');
    loginEmail.value = '';
    loginPassword.value = '';
    loginError.classList.add('d-none');
}

function showPairingSection() {
    loginSection.classList.add('d-none');
    pairingSection.classList.remove('d-none');
    dashboardSection.classList.add('d-none');
    
    const user = auth.currentUser;
    userEmail.textContent = user.email || 'Unknown';
    pairingCodeInput.value = '';
    pairingError.classList.add('d-none');
}

function showDashboard() {
    loginSection.classList.add('d-none');
    pairingSection.classList.add('d-none');
    dashboardSection.classList.remove('d-none');
}

// Error messages
function showLoginError(message) {
    loginError.textContent = message;
    loginError.classList.remove('d-none');
}

function showPairingError(message) {
    pairingError.textContent = message;
    pairingError.classList.remove('d-none');
}

function getErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email':
            return 'Invalid email address';
        case 'auth/user-disabled':
            return 'This account has been disabled';
        case 'auth/user-not-found':
            return 'No account found with this email';
        case 'auth/wrong-password':
            return 'Incorrect password';
        case 'auth/invalid-credential':
            return 'Invalid email or password';
        default:
            return 'Login failed. Please try again.';
    }
}

// Loading states
function setLoginLoading(loading) {
    btnLogin.disabled = loading;
    loginEmail.disabled = loading;
    loginPassword.disabled = loading;
    
    if (loading) {
        btnLoginText.textContent = 'Signing in...';
        btnLoginSpinner.classList.remove('d-none');
    } else {
        btnLoginText.textContent = 'Sign In';
        btnLoginSpinner.classList.add('d-none');
    }
}

function setPairingLoading(loading) {
    btnPair.disabled = loading;
    pairingCodeInput.disabled = loading;
    
    if (loading) {
        btnPairText.textContent = 'Pairing...';
        btnPairSpinner.classList.remove('d-none');
    } else {
        btnPairText.textContent = 'Pair Device';
        btnPairSpinner.classList.add('d-none');
    }
}

// ========== REMOTE CONTROL COMMANDS ==========

function setupCommandButtons() {
    // Ring Phone
    document.getElementById('btnRingPhone')?.addEventListener('click', () => {
        sendCommand('ring_phone', {});
    });

    // Get Location
    document.getElementById('btnGetLocation')?.addEventListener('click', () => {
        sendCommand('get_location', {});
    });

    // Open URL
    document.getElementById('btnOpenUrl')?.addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('urlModal'));
        modal.show();
    });

    // Send URL
    document.getElementById('btnSendUrl')?.addEventListener('click', () => {
        const url = document.getElementById('urlInput').value.trim();
        if (url) {
            sendCommand('open_url', { url });
            bootstrap.Modal.getInstance(document.getElementById('urlModal')).hide();
            document.getElementById('urlInput').value = '';
        } else {
            alert('Please enter a URL');
        }
    });
    
    // Send SMS
    document.getElementById('btnSendSms')?.addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('smsModal'));
        modal.show();
    });
    
    // Send SMS Submit
    document.getElementById('btnSendSmsSubmit')?.addEventListener('click', () => {
        const phoneNumber = document.getElementById('smsPhoneNumber').value.trim();
        const message = document.getElementById('smsMessage').value.trim();
        
        if (phoneNumber && message) {
            sendCommand('send_sms', { phoneNumber, message });
            bootstrap.Modal.getInstance(document.getElementById('smsModal')).hide();
            document.getElementById('smsPhoneNumber').value = '';
            document.getElementById('smsMessage').value = '';
        } else {
            alert('Please enter phone number and message');
        }
    });
    
    // Get Call Logs
    document.getElementById('btnGetCallLogs')?.addEventListener('click', () => {
        sendCommand('get_call_logs', { limit: 20 });
    });
    
    // Get SMS Messages
    document.getElementById('btnGetSms')?.addEventListener('click', () => {
        sendCommand('get_sms_messages', { limit: 20 });
    });
    
    // Get Battery Info
    document.getElementById('btnBatteryInfo')?.addEventListener('click', () => {
        sendCommand('get_battery_info', {});
    });
    
    // Camera Stream
    document.getElementById('btnCameraStream')?.addEventListener('click', () => {
        const camera = confirm('Use Front camera? (Cancel for Back camera)') ? 'front' : 'back';
        startCameraStream(camera);
    });
    
    // Stop Stream
    document.getElementById('btnStopStream')?.addEventListener('click', () => {
        stopCameraStream();
    });
    
    // File Manager
    document.getElementById('btnFileManager')?.addEventListener('click', () => {
        const path = prompt('Enter path to list files:', '/sdcard/DCIM');
        if (path) {
            sendCommand('list_files', { path });
        }
    });
}

async function sendCommand(type, data) {
    if (!currentUserId) {
        alert('Not logged in');
        return;
    }

    showCommandStatus(`Sending command: ${type}...`);
    hideCommandResult();

    try {
        // Create command in Firestore
        const commandRef = firestore.collection('users')
            .doc(currentUserId)
            .collection('commands')
            .doc();

        await commandRef.set({
            type: type,
            data: data,
            timestamp: Date.now(),
            status: 'pending'
        });

        showCommandStatus(`Command sent. Waiting for response...`);

        // Listen for command completion
        const unsubscribe = commandRef.onSnapshot((doc) => {
            const commandData = doc.data();
            
            if (commandData.status === 'completed') {
                showCommandStatus(`Command completed successfully!`, 'success');
                showCommandResult(commandData.result);
                unsubscribe();
                
                // Auto-hide after 10 seconds
                setTimeout(() => {
                    hideCommandStatus();
                    hideCommandResult();
                }, 10000);
            } else if (commandData.status === 'failed') {
                showCommandStatus(`Command failed: ${commandData.error}`, 'danger');
                unsubscribe();
            }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            unsubscribe();
            showCommandStatus('Command timeout. Device may be offline.', 'warning');
        }, 30000);

    } catch (error) {
        console.error('Send command error:', error);
        showCommandStatus(`Error: ${error.message}`, 'danger');
    }
}

function showCommandStatus(message, type = 'info') {
    const statusEl = document.getElementById('commandStatus');
    statusEl.className = `alert alert-${type} mt-3`;
    statusEl.textContent = message;
    statusEl.classList.remove('d-none');
}

function hideCommandStatus() {
    document.getElementById('commandStatus').classList.add('d-none');
}

function showCommandResult(result) {
    const resultEl = document.getElementById('commandResult');
    const resultText = document.getElementById('commandResultText');
    
    // Special handling for images (take_photo, download_file with image)
    if (result.image) {
        const { image, ...rest } = result;
        let output = '<div class="mb-3">';
        output += `<img src="data:image/jpeg;base64,${image}" class="img-fluid rounded" style="max-width:100%;max-height:400px;"><br>`;
        output += `<small class="text-muted">Image captured (${rest.size} bytes)</small>`;
        output += '</div>';
        output += `<pre>${JSON.stringify(rest, null, 2)}</pre>`;
        resultText.innerHTML = output;
    }
    // Special handling for location result with maps link
    else if (result.mapsUrl) {
        const { mapsUrl, ...rest } = result;
        
        // Create formatted output
        let output = '{\n';
        for (const [key, value] of Object.entries(rest)) {
            output += `  "${key}": ${typeof value === 'string' ? '"' + value + '"' : value},\n`;
        }
        output += `  "mapsUrl": `;
        
        resultText.innerHTML = output + `<a href="${mapsUrl}" target="_blank" class="text-primary text-decoration-underline">${mapsUrl}</a>\n}`;
    }
    // Special handling for file lists
    else if (result.files && Array.isArray(result.files)) {
        let output = `<div class="mb-2"><strong>Path:</strong> ${result.path}</div>`;
        output += `<div class="mb-2"><strong>Files:</strong> ${result.count}</div>`;
        output += '<div class="list-group">';
        result.files.forEach(file => {
            const icon = file.isDirectory ? '📁' : '📄';
            const size = file.isDirectory ? '' : ` (${formatFileSize(file.size)})`;
            output += `<div class="list-group-item">${icon} <strong>${file.name}</strong>${size}</div>`;
        });
        output += '</div>';
        resultText.innerHTML = output;
    }
    else {
        resultText.textContent = JSON.stringify(result, null, 2);
    }
    
    resultEl.classList.remove('d-none');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// ========== CAMERA STREAMING ==========

let cameraStreamListener = null;

async function startCameraStream(camera) {
    if (!currentUserId) {
        alert('Not logged in');
        return;
    }
    
    showCommandStatus(`Starting ${camera} camera stream...`);
    
    try {
        // Send start command
        await sendCommand('start_camera_stream', { camera });
        
        // Show stream card
        document.getElementById('cameraStreamCard').classList.remove('d-none');
        
        // Listen to Firebase Realtime Database for frames
        const database = firebase.database();
        const streamRef = database.ref(`camera_streams/${currentUserId}`);
        
        cameraStreamListener = streamRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.frame && data.active) {
                // Update image
                document.getElementById('cameraStreamImage').src = `data:image/jpeg;base64,${data.frame}`;
                
                // Update info
                const timestamp = new Date(data.timestamp).toLocaleTimeString();
                document.getElementById('streamInfo').textContent = 
                    `Frame ${data.frameNumber} | ${data.camera} camera | ${timestamp}`;
            } else if (data && !data.active) {
                // Stream stopped
                stopCameraStream();
            }
        });
        
        showCommandStatus(`Camera stream active (${camera})`, 'success');
        
    } catch (error) {
        console.error('Start camera stream error:', error);
        showCommandStatus(`Failed to start stream: ${error.message}`, 'danger');
    }
}

async function stopCameraStream() {
    if (!currentUserId) return;
    
    try {
        // Stop listening
        if (cameraStreamListener) {
            const database = firebase.database();
            database.ref(`camera_streams/${currentUserId}`).off('value', cameraStreamListener);
            cameraStreamListener = null;
        }
        
        // Send stop command
        await sendCommand('stop_camera_stream', {});
        
        // Hide stream card
        document.getElementById('cameraStreamCard').classList.add('d-none');
        document.getElementById('cameraStreamImage').src = '';
        
        showCommandStatus('Camera stream stopped', 'info');
        
    } catch (error) {
        console.error('Stop camera stream error:', error);
    }
}

function hideCommandResult() {
    document.getElementById('commandResult').classList.add('d-none');
}
