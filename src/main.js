import "mapbox-gl/dist/mapbox-gl.css"
import "./main.css"
import mapboxgl from "mapbox-gl"
import * as turf from "@turf/turf"
import { io } from "socket.io-client"

mapboxgl.accessToken = "pk.eyJ1IjoibmFqaW1vdiIsImEiOiJjbWRmazhzdG0wZHVzMmlzOGdrNHFreWV6In0.ENVcoFkxKIqNeCEax2JoFg"

const joinButton = document.querySelector( ".joinButton" )

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

	const server = io( "https://friends-socket-server.onrender.com" )

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

	joinButton.onclick = () => {

		const username = prompt( "Type username:" )
		let avatar = prompt( "Type image (avatar/profile) address:" )

		try {

			new URL( avatar )
		}
		catch( err ) {

			avatar = "https://www.kindpng.com/picc/m/22-223863_no-avatar-png-circle-transparent-png.png"
			// console.log( err )
		}

		navigator.geolocation.getCurrentPosition( ( { coords } ) => {

			const coordinates = [
				coords.longitude + Math.random() * Math.random(),
				coords.latitude + Math.random() * Math.random(),
			]

			server.emit( "new_user", {
				username: username,
				avatar: avatar,
				coordinates: coordinates,
			} )
		} )
	}
} )

function addNewUser( geoJSONFeature, map ) {

	const el = document.createElement( "div" )
	el.className = "user"
	el.style.backgroundImage = `url(${ geoJSONFeature.properties.avatar })`

	el.onclick = () => {

		alert( geoJSONFeature.properties.username )
	}

	const marker = new mapboxgl.Marker( el )
	marker.setLngLat( geoJSONFeature.geometry.coordinates )
	marker.addTo( map )
}
