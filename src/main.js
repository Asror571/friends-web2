import "mapbox-gl/dist/mapbox-gl.css"
import "./main.css"
import mapboxgl from "mapbox-gl"
import * as turf from "@turf/turf"
import { io } from "socket.io-client"

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
const userInfoUsername = document.querySelector( "#userInfoUsername" )
const userInfoLocation = document.querySelector( "#userInfoLocation" )
const userAvatarLarge = document.querySelector( "#userAvatarLarge" )

const map = new mapboxgl.Map( {
	container: "map",
	attributionControl: false,
	logoPosition: "bottom-right",
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

	server.on( "new_user", geoJSON => {

		if ( geoJSON.type === "Feature" ) {

			addNewUser( geoJSON, map )
		}
		else if ( geoJSON.type === "FeatureCollection" ) {

			for ( const geoJSONFeature of geoJSON.features ) {

				addNewUser( geoJSONFeature, map )
			}

			const bbox = turf.bbox( geoJSON )

			map.fitBounds( bbox, {
				padding: 200, // pixels
				duration: 1_000, // ms
				essential: true, // reduces motion for accessibility
			} )
		}
	} )

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
} )

function addNewUser( geoJSONFeature, map ) {

	const { avatar } = geoJSONFeature.properties

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

	// URL.revokeObjectURL( avatarURL )
}

function showUserInfo( geoJSONFeature ) {
	const { username, avatar } = geoJSONFeature.properties
	const coordinates = geoJSONFeature.geometry.coordinates

	// Set user info
	userInfoUsername.textContent = username
	userInfoLocation.textContent = `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`

	// Set avatar
	const blob = new Blob( [ avatar.arrayBuffer ], { type: avatar.type } )
	const avatarURL = URL.createObjectURL( blob )
	userAvatarLarge.style.backgroundImage = `url(${ avatarURL })`

	// Show modal
	userInfoModal.style.display = "block"
}
