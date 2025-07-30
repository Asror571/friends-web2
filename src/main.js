import "mapbox-gl/dist/mapbox-gl.css"
import "./main.css"
import mapboxgl from "mapbox-gl"
import * as turf from "@turf/turf"
import { io } from "socket.io-client"
import moment from "moment"

mapboxgl.accessToken = "pk.eyJ1IjoibmFqaW1vdiIsImEiOiJjbWRmazhzdG0wZHVzMmlzOGdrNHFreWV6In0.ENVcoFkxKIqNeCEax2JoFg"

const joinButton = document.querySelector( ".joinButton" )
const joinModal = document.querySelector( "#joinModal" )
const closeModal = document.querySelector( ".close" )
const cancelJoin = document.querySelector( "#cancelJoin" )
const confirmJoin = document.querySelector( "#confirmJoin" )
const usernameInput = document.querySelector( "#usernameInput" )
const avatarInput = document.querySelector( "#avatarInput" )
const avatarPreview = document.querySelector( "#avatarPreview" )
const filePlaceholder = document.querySelector( ".file-placeholder" )

const userInfoModal = document.querySelector( "#userInfoModal" )
const closeUserInfo = document.querySelector( "#closeUserInfo" )
const closeUserInfoBtn = document.querySelector( "#closeUserInfoBtn" )
const showOnMapBtn = document.querySelector( "#showOnMapBtn" )
const userInfoUsername = document.querySelector( "#userInfoUsername" )
const userInfoLocation = document.querySelector( "#userInfoLocation" )
const userAvatarLarge = document.querySelector( "#userAvatarLarge" )
const userInfoJoined = document.querySelector( "#userInfoJoined" )

const notification = document.querySelector( "#notification" )
const notificationText = document.querySelector( "#notificationText" )
const closeNotification = document.querySelector( "#closeNotification" )

const sidebar = document.querySelector( "#sidebar" )
const sidebarTitle = document.querySelector( "#sidebarTitle" )
const userList = document.querySelector( "#userList" )
const emptyState = document.querySelector( "#emptyState" )
const mapElement = document.querySelector( "#map" )

let currentUserData = null // Store current user data for Show on Map
let userMarkers = new Map() // Store user markers: userId -> {marker, geoJSONFeature}
let currentUsers = new Map() // Store current users: userId -> geoJSONFeature

const map = new mapboxgl.Map( {
	container: "map",
	attributionControl: false,
	logoPosition: "bottom-left",
	zoom: 9,
	center: [ 69.2753, 41.3126 ],
	hash: true,
	minZoom: 1,
	maxZoom: 18,
	projection: "mercator",
} )

map.on( "load", async () => {

	console.clear()

	// const server = io( "https://friends-socket-server.onrender.com" )
	const server = io( "http://localhost:3000" )

	let onlineUsers = 0
	let notificationTimeout = null

	server.on( "update_users", usersGeoJSONCollection => {
		updateUsersOnMap( usersGeoJSONCollection )
		
		// Fit map to show all users if there are any
		if ( usersGeoJSONCollection.features.length > 0 ) {
			const bbox = turf.bbox( usersGeoJSONCollection )
			map.fitBounds( bbox, {
				padding: 200,
				duration: 1_000,
				essential: true,
			} )
		}
	} )

	server.on( "init", usersGeoJSONCollection => {

		const count = usersGeoJSONCollection.features.length

		if ( count === 0 ) {
			showEmptyState()
		}
		else {
			hideEmptyState()
			updateSidebarTitle( count )
			
			// Add all existing users to map and sidebar
			for ( const geoJSONFeature of usersGeoJSONCollection.features ) {
				addNewUser( geoJSONFeature, map )
				addUserToSidebar( geoJSONFeature )
			}

			// Fit map to show all users
			const bbox = turf.bbox( usersGeoJSONCollection )
			map.fitBounds( bbox, {
				padding: 200,
				duration: 1_000,
				essential: true,
			} )
		}
	} )

	server.on( "new_user", geoJSON => {

		if ( geoJSON.type === "Feature" ) {
			addNewUser( geoJSON, map )
			addUserToSidebar( geoJSON )
			onlineUsers++
			
			// Hide empty state if this is the first user
			if ( onlineUsers === 1 ) {
				hideEmptyState()
			}
			
			updateSidebarTitle( onlineUsers )
		}
		else if ( geoJSON.type === "FeatureCollection" ) {
			// This means we just joined and server sent us all users (including ourselves)
			onlineUsers = geoJSON.features.length

			// Clear existing user list to avoid duplicates
			clearUserList()
			hideEmptyState()
			updateSidebarTitle( onlineUsers )

			for ( const geoJSONFeature of geoJSON.features ) {
				addNewUser( geoJSONFeature, map )
				addUserToSidebar( geoJSONFeature )
			}

			const bbox = turf.bbox( geoJSON )

			map.fitBounds( bbox, {
				padding: 200,
				duration: 1_000,
				essential: true,
			} )
		}
	} )

	// Init
	server.emit( "init" )

	// Modal functionality
	joinButton.onclick = () => {
		joinModal.style.display = "block"
		usernameInput.focus()
	}

	closeModal.onclick = () => {
		joinModal.style.display = "none"
		resetModal()
	}

	cancelJoin.onclick = () => {
		joinModal.style.display = "none"
		resetModal()
	}

	// User Info Modal functionality
	closeUserInfo.onclick = () => {
		userInfoModal.style.display = "none"
	}

	closeUserInfoBtn.onclick = () => {
		userInfoModal.style.display = "none"
	}

	showOnMapBtn.onclick = () => {
		if ( currentUserData ) {
			showUserOnMap( currentUserData )
			userInfoModal.style.display = "none"
		}
	}

	// Notification functionality
	closeNotification.onclick = () => {
		hideNotification()
	}

	// Close modal when clicking outside
	window.onclick = ( event ) => {
		if ( event.target === joinModal ) {
			joinModal.style.display = "none"
			resetModal()
		}
		if ( event.target === userInfoModal ) {
			userInfoModal.style.display = "none"
		}
	}

	// Avatar preview functionality
	avatarInput.onchange = ( e ) => {
		const file = e.target.files[ 0 ]
		if ( file ) {
			const reader = new FileReader()
			reader.onload = ( e ) => {
				avatarPreview.style.backgroundImage = `url(${ e.target.result })`
				avatarPreview.style.display = "block"
				filePlaceholder.textContent = file.name
				checkFormValid()
			}
			reader.readAsDataURL( file )
		}
	}

	// Username input validation
	usernameInput.oninput = () => {
		checkFormValid()
	}

	// Form validation
	function checkFormValid() {
		const isValid = usernameInput.value.trim() !== "" && avatarInput.files.length > 0
		confirmJoin.disabled = !isValid
	}

	// Reset modal state
	function resetModal() {
		usernameInput.value = ""
		avatarInput.value = ""
		avatarPreview.style.display = "none"
		filePlaceholder.textContent = "Choose your avatar"
		confirmJoin.disabled = true
	}

	// Confirm join functionality
	confirmJoin.onclick = async () => {
		const username = usernameInput.value.trim()
		const file = avatarInput.files[ 0 ]

		if ( !username || !file ) return

		navigator.geolocation.getCurrentPosition( async ( { coords } ) => {
			const coordinates = [
				coords.longitude + Math.random(),
				coords.latitude + Math.random(),

				// coords.longitude,
				// coords.latitude,
			]

			server.emit( "new_user", {
				username: username,
				file: {
					type: file.type,
					arrayBuffer: await file.arrayBuffer(),
				},
				coordinates: coordinates,
			} )

			joinModal.style.display = "none"
			resetModal()
		} )
	}

	// Notification functions
	function showNotification( message ) {
		notificationText.textContent = message
		notification.classList.add( "show" )
		
		// Clear any existing timeout
		if ( notificationTimeout ) {
			clearTimeout( notificationTimeout )
		}
		
		// Auto-hide after 5 seconds
		notificationTimeout = setTimeout( () => {
			hideNotification()
		}, 5000 )
	}

	function hideNotification() {
		notification.classList.add( "hide" )
		
		// Clear timeout if user manually closes
		if ( notificationTimeout ) {
			clearTimeout( notificationTimeout )
			notificationTimeout = null
		}
		
		// Remove classes after animation completes
		setTimeout( () => {
			notification.classList.remove( "show", "hide" )
		}, 300 )
	}

	// Empty state functions
	function showEmptyState() {
		emptyState.style.display = "flex"
		updateSidebarTitle( 0 )
	}

	function hideEmptyState() {
		emptyState.style.display = "none"
	}

	function updateSidebarTitle( count ) {
		sidebarTitle.textContent = `Online Users (${count})`
	}

	function showUserOnMap( geoJSONFeature ) {
		const coordinates = geoJSONFeature.geometry.coordinates
		
		// Center map on user location with zoom
		map.flyTo( {
			center: coordinates,
			zoom: 15,
			duration: 1500,
			essential: true
		} )
	}

	function removeUserFromMap( userId ) {
		if ( userMarkers.has( userId ) ) {
			// Remove marker from map
			userMarkers.get( userId ).marker.remove()
			
			// Remove from memory
			userMarkers.delete( userId )
			currentUsers.delete( userId )
		}
	}

	function updateUsersOnMap( newUsersGeoJSON ) {
		const newUserIds = new Set()

		// Process new users
		for ( const geoJSONFeature of newUsersGeoJSON.features ) {
			const userId = geoJSONFeature.properties.username
			newUserIds.add( userId )
			
			// Add or update user on map
			addNewUser( geoJSONFeature, map )
		}
		
		// Remove users that are no longer in the new list
		for ( const userId of currentUsers.keys() ) {
			if ( !newUserIds.has( userId ) ) {
				removeUserFromMap( userId )
			}
		}
		
		// Update sidebar
		clearUserList()
		if ( newUsersGeoJSON.features.length === 0 ) {
			showEmptyState()
		} else {
			hideEmptyState()
			for ( const geoJSONFeature of newUsersGeoJSON.features ) {
				addUserToSidebar( geoJSONFeature )
			}
		}
		
		// Update counts
		onlineUsers = newUsersGeoJSON.features.length
		updateSidebarTitle( onlineUsers )
	}

	// Add window resize listener
	window.addEventListener( "resize", () => {
		map.resize()
	} )

	function clearUserList() {
		// Clear all user items but keep empty state
		const userItems = userList.querySelectorAll( ".user-list-item" )
		userItems.forEach( item => item.remove() )
	}

	function addUserToSidebar( geoJSONFeature ) {
		const { username, avatar, joinedAt } = geoJSONFeature.properties

		// Create avatar blob
		const blob = new Blob( [ avatar.arrayBuffer ], { type: avatar.type } )
		const avatarURL = URL.createObjectURL( blob )

		// Create user list item
		const userItem = document.createElement( "div" )
		userItem.className = "user-list-item"
		userItem.onclick = () => showUserInfo( geoJSONFeature )

		userItem.innerHTML = `
			<div class="user-list-avatar" style="background-image: url(${avatarURL})"></div>
			<div class="user-list-info">
				<div class="user-list-name">${username}</div>
				<div class="user-list-joined">${moment( joinedAt ).fromNow()}</div>
			</div>
		`

		userList.appendChild( userItem )
	}
} )

function addNewUser( geoJSONFeature, map ) {

	const { avatar, username } = geoJSONFeature.properties
	const userId = username // Use username as unique identifier

	// If user already exists, remove old marker first
	if ( userMarkers.has( userId ) ) {
		userMarkers.get( userId ).marker.remove()
	}

	const blob = new Blob( [ avatar.arrayBuffer ], { type: avatar.type } )
	const avatarURL = URL.createObjectURL( blob )

	const el = document.createElement( "div" )
	el.className = "user"
	el.style.backgroundImage = `url(${ avatarURL })`

	el.onclick = () => {
		showUserInfo( geoJSONFeature )
	}

	const marker = new mapboxgl.Marker( el )
	marker.setLngLat( geoJSONFeature.geometry.coordinates )
	marker.addTo( map )

	// Store in global memory
	userMarkers.set( userId, { marker, geoJSONFeature } )
	currentUsers.set( userId, geoJSONFeature )

	// URL.revokeObjectURL( avatarURL )
}

function showUserInfo( geoJSONFeature ) {
	const { username, avatar, joinedAt } = geoJSONFeature.properties
	const coordinates = geoJSONFeature.geometry.coordinates

	// Store current user data for Show on Map button
	currentUserData = geoJSONFeature

	// Set user info
	userInfoUsername.textContent = username
	userInfoLocation.textContent = `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`

	// Set avatar
	const blob = new Blob( [ avatar.arrayBuffer ], { type: avatar.type } )
	const avatarURL = URL.createObjectURL( blob )
	userAvatarLarge.style.backgroundImage = `url(${ avatarURL })`

	// Set joined info
	userInfoJoined.textContent = moment( joinedAt ).fromNow()

	// Show modal
	userInfoModal.style.display = "block"
}
