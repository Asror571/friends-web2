import "mapbox-gl/dist/mapbox-gl.css"
import "./main.css"
import mapboxgl from "mapbox-gl"
import * as turf from "@turf/turf"
import { io } from "socket.io-client"
import moment from "moment"

mapboxgl.accessToken = "pk.eyJ1IjoibmFqaW1vdiIsImEiOiJjbWRmazhzdG0wZHVzMmlzOGdrNHFreWV6In0.ENVcoFkxKIqNeCEax2JoFg"

// --- DOM Elements ---
const joinButton = document.querySelector(".joinButton")
const exitButton = document.querySelector(".exitButton")
const joinModal = document.querySelector("#joinModal")
const closeModal = document.querySelector(".close")
const cancelJoin = document.querySelector("#cancelJoin")
const confirmJoin = document.querySelector("#confirmJoin")
const usernameInput = document.querySelector("#usernameInput")
const usernameError = document.querySelector("#usernameError")
const avatarInput = document.querySelector("#avatarInput")
const avatarPreview = document.querySelector("#avatarPreview")
const filePlaceholder = document.querySelector(".file-placeholder")

const userInfoModal = document.querySelector("#userInfoModal")
const closeUserInfo = document.querySelector("#closeUserInfo")
const closeUserInfoBtn = document.querySelector("#closeUserInfoBtn")
const showOnMapBtn = document.querySelector("#showOnMapBtn")
const userInfoUsername = document.querySelector("#userInfoUsername")
const userInfoLocation = document.querySelector("#userInfoLocation")
const userAvatarLarge = document.querySelector("#userAvatarLarge")
const userInfoJoined = document.querySelector("#userInfoJoined")
const messageInput = document.querySelector("#messageInput")
const sendMessageBtn = document.querySelector("#sendMessageBtn")

const notification = document.querySelector("#notification")
const notificationText = document.querySelector("#notificationText")
const closeNotification = document.querySelector("#closeNotification")

const sidebarTitle = document.querySelector("#sidebarTitle")
const userList = document.querySelector("#userList")
const emptyState = document.querySelector("#emptyState")

// --- State ---
let selfData = null // To store current user's own data (including userId)
let currentUserData = null // To store data for the user info modal
let userMarkers = new Map() // Stores user markers and data: userId -> { marker, geoJSONFeature, avatarURL }
let socket = null // To hold the socket connection

const map = new mapboxgl.Map({
	container: "map",
	attributionControl: false,
	logoPosition: "bottom-left",
	zoom: 9,
	center: [69.2753, 41.3126],
	hash: true,
	minZoom: 1,
	maxZoom: 18,
	projection: "mercator",
})

// --- Main Logic ---
map.on("load", () => {
	console.clear()
	connectToServer()
})

function connectToServer() {
	const serverUrl = "https://friends-socket-server2.onrender.com"
	socket = io(serverUrl)

	// --- Socket Event Handlers ---
	socket.on("connect", () => {
		console.log("Connected to server with ID:", socket.id)
	})

	socket.on("you_joined", geoJSON => {
		console.log("Successfully joined the map:", geoJSON)
		selfData = geoJSON
		
		joinModal.style.display = "none"
		resetModal()
		joinButton.style.display = "none"
		exitButton.style.display = "block"
		
		showNotification(`You have joined as ${geoJSON.properties.username}!`)
		fitMapToUsers()
	})

	socket.on("update_users", usersGeoJSONCollection => {
		console.log("Received user updates:", usersGeoJSONCollection)
		updateUsersOnMap(usersGeoJSONCollection)
	})

	socket.on("receive_message", ({ senderId, message }) => {
		displayMessageBubble(senderId, message)
	})

	// New: Listen for username taken error
	socket.on("username_taken", ({ message }) => {
		console.error("Username error:", message)
		showUsernameError(message) // Show error in the modal
		// Reset the join button
		confirmJoin.disabled = false
		confirmJoin.textContent = "Join Map"
	})

	socket.on("disconnect", () => {
		console.log("Disconnected from server.")
		showNotification("You have been disconnected.")
		resetUI()
	})
}

// --- UI Event Listeners ---
joinButton.onclick = () => {
	joinModal.style.display = "block"
	usernameInput.focus()
}

exitButton.onclick = () => {
	if (socket && selfData) {
		socket.emit("user_exit")
	}
}

sendMessageBtn.onclick = () => {
	const message = messageInput.value.trim()
	if (message && currentUserData && socket) {
		const recipientId = currentUserData.properties.userId

		if (selfData && selfData.properties.userId === recipientId) {
			showNotification("You can't send a message to yourself.")
			return
		}

		socket.emit("send_message", { recipientId, message })
		messageInput.value = ""
		userInfoModal.style.display = "none"
		showNotification("Message sent!")
	}
}

confirmJoin.onclick = async () => {
	const username = usernameInput.value.trim()
	const file = avatarInput.files[0]

	if (!username || !file) return

	// Clear previous errors
	hideUsernameError()
	confirmJoin.disabled = true
	confirmJoin.textContent = "Joining..."

	navigator.geolocation.getCurrentPosition(
		async ({ coords }) => {
			const coordinates = [coords.longitude, coords.latitude]

			socket.emit("new_user", {
				username: username,
				file: {
					type: file.type,
					arrayBuffer: await file.arrayBuffer(),
				},
				coordinates: coordinates,
			})
		},
		(error) => {
			console.error("Geolocation error:", error)
			showNotification("Could not get your location. Please allow location access.")
			confirmJoin.disabled = false
			confirmJoin.textContent = "Join Map"
		}
	)
}

// --- Core Data and UI Sync Function ---
function updateUsersOnMap(usersGeoJSON) {
	const incomingUserIds = new Set(usersGeoJSON.features.map(f => f.properties.userId))

	const existingUserIds = new Set(userMarkers.keys())
	for (const existingUserId of existingUserIds) {
		if (!incomingUserIds.has(existingUserId)) {
			removeUser(existingUserId)
		}
	}

	for (const geoJSONFeature of usersGeoJSON.features) {
		const userId = geoJSONFeature.properties.userId
		if (!userMarkers.has(userId)) {
			addNewUser(geoJSONFeature)
		}
		addUserToSidebar(geoJSONFeature)
	}

	updateSidebarTitle()
}


// --- Helper Functions ---

function addNewUser(geoJSONFeature) {
	const { userId, avatar } = geoJSONFeature.properties
	
	const blob = new Blob([avatar.arrayBuffer], { type: avatar.type })
	const avatarURL = URL.createObjectURL(blob)

	const el = document.createElement("div")
	el.className = "user"
	el.style.backgroundImage = `url(${avatarURL})`
	el.onclick = () => showUserInfo(geoJSONFeature)

	const marker = new mapboxgl.Marker(el)
		.setLngLat(geoJSONFeature.geometry.coordinates)
		.addTo(map)

	userMarkers.set(userId, { marker, geoJSONFeature, avatarURL })
}

function removeUser(userId) {
	if (userMarkers.has(userId)) {
		const { marker, avatarURL } = userMarkers.get(userId)
		marker.remove()
		URL.revokeObjectURL(avatarURL)
		userMarkers.delete(userId)

		const userItem = document.getElementById(`user-item-${userId}`)
		if (userItem) {
			userItem.remove()
		}
	}
}

function addUserToSidebar(geoJSONFeature) {
	const { userId, username, avatar, joinedAt } = geoJSONFeature.properties

	const isSelf = selfData && selfData.properties.userId === userId
	const selfTag = isSelf ? '<span class="self-tag">(You)</span>' : ''
	
	const existingItem = document.getElementById(`user-item-${userId}`)
	if (existingItem) {
		// Update name in case 'you' status changed
		existingItem.querySelector('.user-list-name').innerHTML = `${username} ${selfTag}`
		return
	}

	const blob = new Blob([avatar.arrayBuffer], { type: avatar.type })
	const avatarURL = URL.createObjectURL(blob)

	const userItem = document.createElement("div")
	userItem.className = "user-list-item"
	userItem.id = `user-item-${userId}`
	userItem.onclick = () => showUserInfo(geoJSONFeature)

	userItem.innerHTML = `
        <div class="user-list-avatar" style="background-image: url(${avatarURL})"></div>
        <div class="user-list-info">
            <div class="user-list-name">${username} ${selfTag}</div>
            <div class="user-list-joined">${moment(joinedAt).fromNow()}</div>
        </div>
    `
	userList.prepend(userItem)
}

function displayMessageBubble(senderId, message) {
	const sender = userMarkers.get(senderId)
	if (!sender) return

	const markerElement = sender.marker.getElement()

	const existingBubble = markerElement.querySelector(".message-bubble")
	if (existingBubble) {
		existingBubble.remove()
	}

	const bubble = document.createElement("div")
	bubble.className = "message-bubble"
	bubble.textContent = message

	markerElement.appendChild(bubble)

	setTimeout(() => {
		bubble.remove()
	}, 20000)
}

function showUserInfo(geoJSONFeature) {
	const { userId, username, avatar, joinedAt } = geoJSONFeature.properties
	const coordinates = geoJSONFeature.geometry.coordinates
	currentUserData = geoJSONFeature

	userInfoUsername.textContent = username
	userInfoLocation.textContent = `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`

	const blob = new Blob([avatar.arrayBuffer], { type: avatar.type })
	const avatarURL = URL.createObjectURL(blob)
	userAvatarLarge.style.backgroundImage = `url(${avatarURL})`
	setTimeout(() => URL.revokeObjectURL(avatarURL), 1000)

	userInfoJoined.textContent = moment(joinedAt).fromNow()

	const messageSender = document.querySelector('.message-sender')
	if (selfData && selfData.properties.userId !== userId) {
		messageSender.style.display = 'flex'
	} else {
		messageSender.style.display = 'none'
	}

	userInfoModal.style.display = "block"
}

function updateSidebarTitle() {
	const count = userMarkers.size
	sidebarTitle.textContent = `Online Users (${count})`
	if (count > 0) {
		hideEmptyState()
	} else {
		showEmptyState()
	}
}

function fitMapToUsers() {
	if (userMarkers.size === 0) {
		map.flyTo({ center: [69.2753, 41.3126], zoom: 9 })
		return
	}

	const geoJSON = {
		type: "FeatureCollection",
		features: Array.from(userMarkers.values()).map(u => u.geoJSONFeature)
	}
	
	if (geoJSON.features.length === 1) {
		map.flyTo({
			center: geoJSON.features[0].geometry.coordinates,
			zoom: 14,
			duration: 1500
		})
	} else {
		const bbox = turf.bbox(geoJSON)
		map.fitBounds(bbox, {
			padding: { top: 100, bottom: 100, left: 100, right: 100 },
			duration: 1000,
			essential: true,
		})
	}
}

function resetUI() {
	for (const userId of userMarkers.keys()) {
		removeUser(userId)
	}
	userMarkers.clear()

	userList.innerHTML = ''
	showEmptyState()
	updateSidebarTitle()

	joinButton.style.display = "block"
	exitButton.style.display = "none"

	selfData = null
	currentUserData = null
}

// --- Modal and Form Logic ---
function resetModal() {
	usernameInput.value = ""
	avatarInput.value = ""
	avatarPreview.style.display = "none"
	filePlaceholder.textContent = "Choose your avatar"
	confirmJoin.disabled = true
	confirmJoin.textContent = "Join Map"
	hideUsernameError()
}

closeModal.onclick = () => {
	joinModal.style.display = "none"
	resetModal()
}
cancelJoin.onclick = () => {
	joinModal.style.display = "none"
	resetModal()
}
closeUserInfo.onclick = () => (userInfoModal.style.display = "none")
closeUserInfoBtn.onclick = () => (userInfoModal.style.display = "none")

showOnMapBtn.onclick = () => {
	if (currentUserData) {
		map.flyTo({
			center: currentUserData.geometry.coordinates,
			zoom: 15,
			duration: 1500,
		})
		userInfoModal.style.display = "none"
	}
}
window.onclick = (event) => {
	if (event.target === joinModal) {
		joinModal.style.display = "none"
		resetModal()
	}
	if (event.target === userInfoModal) {
		userInfoModal.style.display = "none"
	}
}
avatarInput.onchange = (e) => {
	const file = e.target.files[0]
	if (file) {
		const reader = new FileReader()
		reader.onload = (e) => {
			avatarPreview.style.backgroundImage = `url(${e.target.result})`
			avatarPreview.style.display = "block"
			filePlaceholder.textContent = file.name
			checkFormValid()
		}
		reader.readAsDataURL(file)
	}
}
usernameInput.oninput = () => {
	// Clear error message on new input
	hideUsernameError()
	checkFormValid()
}
function checkFormValid() {
	const isValid = usernameInput.value.trim() !== "" && avatarInput.files.length > 0
	confirmJoin.disabled = !isValid
}
function showUsernameError(message) {
	usernameError.textContent = message
	usernameError.classList.add("show")
}
function hideUsernameError() {
	usernameError.classList.remove("show")
}
function showEmptyState() {
	emptyState.style.display = "flex"
}
function hideEmptyState() {
	emptyState.style.display = "none"
}

// --- Notification Logic ---
let notificationTimeout = null
function showNotification(message) {
	notificationText.textContent = message
	notification.classList.add("show")
	notification.classList.remove("hide")
	if (notificationTimeout) clearTimeout(notificationTimeout)
	notificationTimeout = setTimeout(hideNotification, 5000)
}
function hideNotification() {
	notification.classList.add("hide")
	notification.classList.remove("show")
	if (notificationTimeout) {
		clearTimeout(notificationTimeout)
		notificationTimeout = null
	}
}
closeNotification.onclick = hideNotification

checkFormValid()
