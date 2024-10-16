import { LitElement, html, css } from 'lit';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

// Import the inlined world map data
import worldData from './data/world-110m.v1.json';

/**
 * GlobeComponent
 * 
 * A reusable Web Component that renders an interactive 3D globe using D3.js and TopoJSON.
 * It highlights specified locations, automatically draws arcs from a central location to each one,
 * and displays labels above each location's dot.
 * 
 * Properties:
 * - centralLocation (Object): The central location from which arcs originate.
 * - locations (Array): Array of location objects to highlight.
 * 
 * Methods:
 * - setZoom(zoomLevel): Sets the zoom level programmatically.
 * - getZoom(): Retrieves the current zoom level.
 * - addLocation(location): Adds a new location to the globe.
 * - removeLocation(name): Removes a location from the globe by name.
 * - updateLocation(name, newLabel, newArcColor): Updates the label and arc color of a location.
 * 
 * Usage:
 * ```html
 * <globe-component
 *   central-location='{"name": "Zurich", "coordinates": [8.5500,47.3667]}'
 *   locations='[
 *     {"name": "Paris", "coordinates": [2.3488,48.8534], "arcColor": "green"},
 *     {"name": "London", "coordinates": [-0.1257,51.5085], "arcColor": "blue"},
 *     {"name": "Milan", "coordinates": [9.1895,45.4643], "arcColor": "red"},
 *     {"name": "Frankfurt", "coordinates": [8.6842,50.1155], "arcColor": "orange"}
 *   ]'
 *   style="width: 400px; height: 400px;"
 * ></globe-component>
 * ```
 */
class GlobeComponent extends LitElement {
  static properties = {
    centralLocation: {
      type: Object,
      attribute: 'central-location',
      converter: {
        fromAttribute(value) {
          try {
            return JSON.parse(value);
          } catch (e) {
            console.error('Invalid JSON for central-location:', e);
            return { name: 'Home', coordinates: [0, 0] };
          }
        }
      }
    },
    locations: {
      type: Array,
      converter: {
        fromAttribute(value) {
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch (e) {
              console.error('Invalid JSON for locations:', e);
              return [];
            }
          }
          return value;
        }
      }
    },
  };

  static styles = css`
    :host {
      display: block;
      touch-action: manipulation; /* Allows pinch-zoom and disables other touch actions */
    }
    svg {
      width: 100%;
      height: 100%;
      cursor: grab;
      overflow: hidden; /* Prevent SVG elements from overflowing */
      pointer-events: all; /* Ensure SVG captures all pointer events */
      user-select: none; /* Prevent text selection during drag */
    }
    .land {
      fill: #FFFFFF;
      stroke: #000;
      stroke-width: 0.3px;
    }
    .globe {
      fill: #000000;
    }
    .graticule {
      fill: none;
      stroke: #CCCCCC60;
      stroke-width: 0.5px;
    }
    .arc {
      fill: none;
      stroke-width: 3px; /* Increased stroke width */
      opacity: 0.8; /* Slight opacity for better visibility */
    }
    .point {
      stroke: #fff;
      stroke-width: 1px;
      cursor: pointer;
    }
    .point-label {
      font-size: 16px;
      font-weight: bold;
      font-family: Arial, sans-serif;
      fill: black;
      stroke: white;
      stroke-width: 0.5px;
      text-anchor: middle;
    }
  `;

  constructor() {
    super();

    // Default central location (Zurich)
    this.centralLocation = { name: 'Zurich', coordinates: [8.5500, 47.3667] };

    // Default locations
    this.locations = [
    ];

    // Placeholder for zoom behavior
    this.zoom = null;

    // Initial scale based on component's size
    this.initialScale = 300; // Will be recalculated based on container size
  }

  render() {
    return html`<div id="globe-container" role="img" aria-label="Interactive 3D Globe"></div>`;
  }

  firstUpdated() {
    this.setupGlobe();
    window.addEventListener('resize', () => this.handleResize());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', () => this.handleResize());
  }

  /**
   * Sets up the globe visualization.
   */
  setupGlobe() {
    const width = this.offsetWidth;
    const height = this.offsetHeight;

    // Calculate initial scale based on width and height
    this.initialScale = Math.min(width, height) / 2; // Ensures the globe fills the container

    // Initialize the projection
    this.projection = d3.geoOrthographic()
      .scale(this.initialScale)
      .translate([width / 2, height / 2])
      .clipAngle(90)
      .rotate([-this.centralLocation.coordinates[0], -this.centralLocation.coordinates[1]]);

    this.path = d3.geoPath().projection(this.projection);

    // Initialize the SVG element
    this.svg = d3.select(this.renderRoot.querySelector('#globe-container'))
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .call(this.initializeZoom(width, height))
      .on('dblclick.zoom', null); // Disable double-click zoom

    // Draw the globe (sphere)
    this.svg.append('path')
      .datum({ type: 'Sphere' })
      .attr('class', 'globe')
      .attr('d', this.path);

    // Draw the land
    const countries = topojson.feature(worldData, worldData.objects.countries);
    this.svg.append('g')
      .selectAll('path.land')
      .data(countries.features)
      .enter().append('path')
      .attr('class', 'land')
      .attr('d', this.path);

    // Add graticules (latitude and longitude lines)
    const graticule = d3.geoGraticule();
    this.svg.append('path')
      .datum(graticule)
      .attr('class', 'graticule')
      .attr('d', this.path);

    // Draw arcs after land and graticules
    this.drawArcs();

    // Highlight all points with labels
    this.highlightPoints();

    // Make the globe draggable with dynamic rotation speed
    this.makeGlobeDraggable();

    // Adjust initial projection to fit all locations
    this.adjustProjectionToFitLocations();
  }

  /**
   * Initializes zoom behavior using D3's zoom.
   * @param {Number} width - Width of the SVG container.
   * @param {Number} height - Height of the SVG container.
   */
  initializeZoom(width, height) {
    // Define the zoom behavior with updated scale limits
    // minScale is now set to finalScale / 10 in adjustProjectionToFitLocations
    const minScale = this.initialScale / 10; // Allow greater zooming out
    const maxScale = this.initialScale * 3; // Allow more zooming in

    this.zoom = d3.zoom()
      .scaleExtent([minScale, maxScale])
      .filter(function (event) {
        // Allow zooming only via wheel and touch gestures
        return event.type === 'wheel' || event.type.startsWith('touch');
      })
      .on('zoom', (event) => this.handleZoom(event));

    return this.zoom;
  }

  /**
   * Handles zoom events by updating the projection's scale.
   * @param {Object} event - D3 zoom event.
   */
  handleZoom(event) {
    const { transform } = event;

    // Clamp the scale within min and max
    const clampedScale = Math.max(this.zoom.scaleExtent()[0], Math.min(transform.k, this.zoom.scaleExtent()[1]));

    // Update the projection's scale
    this.projection.scale(clampedScale);

    // Re-render the globe, arcs, and points
    this.updateProjection();
  }

  /**
   * Updates the projection and re-renders the globe, arcs, and points.
   */
  updateProjection() {
    this.path = d3.geoPath().projection(this.projection);
    this.svg.selectAll('path').attr('d', this.path);
    this.highlightPoints();
    this.drawArcs();
  }

  /**
   * Highlights all visible points on the globe with labels.
   */
  highlightPoints() {
    // Remove existing points and labels
    this.svg.selectAll('g.point-group').remove();

    // Add central location point and label
    this.addPoint(this.centralLocation, true);

    // Iterate over all locations
    this.locations.forEach(location => {
      this.addPoint(location, false);
    });
  }

  /**
   * Adds a point and label to the globe.
   * @param {Object} location - The location object.
   * @param {Boolean} isCentral - Whether the location is the central location.
   */
  addPoint(location, isCentral) {
    const [lon, lat] = location.coordinates;

    // Validate coordinates
    if (typeof lon === 'number' && typeof lat === 'number') {
      const rotate = this.projection.rotate();
      const angle = d3.geoDistance([lon, lat], [-rotate[0], -rotate[1]]);

      if (angle < Math.PI / 2) { // Check if point is on the front side
        const point = this.projection([lon, lat]);

        // Create a group for point and label
        const pointGroup = this.svg.append('g')
          .attr('class', 'point-group');

        // Draw the point
        pointGroup.append('circle')
          .attr('class', 'point')
          .attr('cx', point[0])
          .attr('cy', point[1])
          .attr('r', isCentral ? 6 : 5)
          .attr('fill', isCentral ? 'gray' : 'red')

        // Add the label above the point
        pointGroup.append('text')
          .attr('class', 'point-label')
          .attr('x', point[0])
          .attr('y', point[1] - 10) // Position label above the point
          .text(location.name)
      }
    } else {
      console.warn(`Invalid coordinates for location: ${location.name}`);
    }
  }

  /**
   * Creates a GeoJSON LineString (arc) between two points using interpolation.
   * @param {Array} source - [longitude, latitude] of the source point.
   * @param {Array} target - [longitude, latitude] of the target point.
   * @returns {Object} - GeoJSON Feature representing the arc.
   */
  createArc(source, target) {
    const interpolate = d3.geoInterpolate(source, target);
    const steps = 100; // Increased number of steps for smoother arcs
    const coordinates = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      coordinates.push(interpolate(t));
    }
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates,
      },
    };
  }

  /**
   * Draws arcs from the central location to each other location.
   */
  drawArcs() {
    // Remove existing arcs
    this.svg.selectAll('g.arc-group').remove();

    // Draw the arcs
    const arcGroups = this.svg.append('g')
      .attr('class', 'arc-group')
      .selectAll('g.arc-item')
      .data(this.locations)
      .enter()
      .append('g')
      .attr('class', 'arc-item');

    // Draw each arc
    arcGroups.append('path')
      .attr('class', 'arc')
      .attr('d', d => {
        // Source is central location, target is the location
        const sourceLoc = this.centralLocation;
        const targetLoc = d;

        // Check if both source and target are on the front side
        const rotate = this.projection.rotate();
        const sourceAngle = d3.geoDistance(sourceLoc.coordinates, [-rotate[0], -rotate[1]]);
        const targetAngle = d3.geoDistance(targetLoc.coordinates, [-rotate[0], -rotate[1]]);

        // Only draw arcs if both points are on the front side
        if (sourceAngle > Math.PI / 2 || targetAngle > Math.PI / 2) {
          return null;
        }

        return this.path(this.createArc(sourceLoc.coordinates, targetLoc.coordinates));
      })
      .attr('stroke', d => d.arcColor || 'blue')
      .attr('stroke-width', 3) // Increased stroke width for visibility
      .attr('fill', 'none')
      .attr('opacity', 0.8) // Slight opacity for better visibility
      .attr('pointer-events', 'none'); // Prevent arcs from capturing pointer events
  }

  /**
   * Makes the globe draggable to rotate with rotation speed based on zoom level.
   */
  makeGlobeDraggable() {
    let startRotate;

    this.svg.call(
      d3.drag()
        .on('start', (event) => {
          startRotate = [event.x, event.y];
          this.svg.style('cursor', 'grabbing');
        })
        .on('drag', (event) => {
          const dx = event.x - startRotate[0];
          const dy = event.y - startRotate[1];
          const rotation = this.projection.rotate();

          // Get the current zoom scale
          const currentZoom = this.getZoom();

          // Enhanced Rotation Factor
          const rotationFactor = 100 / currentZoom; // Adjusted from 10 to 100

          this.projection.rotate([
            rotation[0] + (dx / 2) * rotationFactor,
            rotation[1] - (dy / 2) * rotationFactor
          ]);

          // Update paths and points
          this.svg.selectAll('path').attr('d', this.path);
          this.highlightPoints();

          // Update arcs
          this.drawArcs();

          startRotate = [event.x, event.y];
        })
        .on('end', () => {
          this.svg.style('cursor', 'grab');
        })
    );
  }

  /**
   * Adjusts the projection's rotation and scale to fit all locations within the view with some margin.
   */
  adjustProjectionToFitLocations() {
    if (this.locations.length === 0) return;

    // Convert locations to GeoJSON features, including central location
    const allLocations = [this.centralLocation, ...this.locations];

    const features = allLocations.map(loc => ({
      type: 'Feature',
      properties: { name: loc.name },
      geometry: {
        type: 'Point',
        coordinates: loc.coordinates,
      },
    }));

    const featureCollection = { type: 'FeatureCollection', features };

    // Compute centroid
    const centroid = d3.geoCentroid(featureCollection);

    // Compute maximum angular distance from centroid to any location
    let maxDistance = 0;
    features.forEach(feature => {
      const distance = d3.geoDistance(centroid, feature.geometry.coordinates);
      if (distance > maxDistance) maxDistance = distance;
    });

    // Clamp maxDistance to 90 degrees (pi/2 radians) as beyond that, points are not visible
    maxDistance = Math.min(maxDistance, Math.PI / 2);

    // Compute the necessary scale to fit all points within the view with margin
    const marginFactor = 0.8; // 80% of the radius
    const radius = Math.min(this.offsetWidth, this.offsetHeight) / 2;
    const requiredScale = (marginFactor * radius) / Math.sin(maxDistance);

    const finalScale = requiredScale; // Set finalScale solely based on requiredScale

    // Update projection's rotation to center on centroid
    this.projection.rotate([-centroid[0], -centroid[1]]);

    // Update projection's scale
    this.projection.scale(finalScale);

    // Update path with the new projection
    this.path = d3.geoPath().projection(this.projection);

    // Update zoom's scaleExtent based on new scale
    const minScale = finalScale / 10; // Allow zooming out further
    const maxScale = finalScale * 3; // Allow more zooming in
    this.zoom.scaleExtent([minScale, maxScale]);

    // Re-render the globe, arcs, and points
    this.svg.selectAll('path').attr('d', this.path);
    this.drawArcs();
    this.highlightPoints();

    // Apply the initial zoom transform to match the projection's scale
    this.svg.call(this.zoom.transform, d3.zoomIdentity.scale(this.projection.scale()));
  }

  /**
   * Handles window resize events to maintain responsiveness.
   */
  handleResize() {
    const width = this.offsetWidth;
    const height = this.offsetHeight;

    // Update the projection's translate
    this.projection.translate([width / 2, height / 2]);

    // Recalculate initial scale
    this.initialScale = Math.min(width, height) / 2; // Ensures the globe fills the container
    this.projection.scale(this.initialScale);

    // Update zoom scale extent based on new scale
    const minScale = this.initialScale / 10; // Allow greater zooming out
    const maxScale = this.initialScale * 3; // Allow more zooming in
    this.zoom.scaleExtent([minScale, maxScale]);

    // Update the SVG size
    this.svg
      .attr('width', width)
      .attr('height', height);

    // Re-render the globe, arcs, and points
    this.path = d3.geoPath().projection(this.projection);
    this.svg.selectAll('path').attr('d', this.path);
    this.drawArcs();
    this.highlightPoints();

    // Adjust projection to fit locations
    this.adjustProjectionToFitLocations();
  }

  /**
   * Lifecycle method called when properties are updated.
   * @param {Map} changedProperties - Properties that have changed.
   */
  updated(changedProperties) {
    if (changedProperties.has('centralLocation') || changedProperties.has('locations')) {
      const width = this.offsetWidth;
      const height = this.offsetHeight;

      // Update projection rotation to center on the central location
      this.projection
        .rotate([-this.centralLocation.coordinates[0], -this.centralLocation.coordinates[1]]);

      // Update path with the new projection
      this.path = d3.geoPath().projection(this.projection);
      this.svg.selectAll('path').attr('d', this.path);

      // Re-draw arcs and points
      this.drawArcs();
      this.highlightPoints();

      // Adjust projection to fit locations
      this.adjustProjectionToFitLocations();
    }
  }

  /**
   * Sets the zoom level of the globe programmatically with a smooth transition.
   * @param {Number} zoomLevel - The desired zoom level (scale).
   */
  setZoom(zoomLevel) {
    // Define the zoom transform
    const transform = d3.zoomIdentity.scale(zoomLevel);

    // Apply the zoom transform with a smooth transition
    this.svg.transition().duration(750).call(this.zoom.transform, transform);
  }

  /**
   * Gets the current zoom level of the globe.
   * @returns {Number} - The current zoom level (scale).
   */
  getZoom() {
    return this.projection.scale();
  }

  /**
   * Adds a new location to the globe.
   * @param {Object} location - The location object to add.
   */
  addLocation(location) {
    if (location && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      const [lon, lat] = location.coordinates;
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        console.warn('Invalid longitude or latitude values:', location);
        return;
      }
      this.locations = [...this.locations, location];

      // Adjust projection to fit new location
      this.adjustProjectionToFitLocations();
    } else {
      console.warn('Invalid location format:', location);
    }
  }

  /**
   * Removes a location from the globe by name.
   * @param {String} name - The name of the location to remove.
   */
  removeLocation(name) {
    this.locations = this.locations.filter(loc => loc.name !== name);

    // Re-adjust projection to fit remaining locations
    this.adjustProjectionToFitLocations();
  }

  /**
   * Updates the label and arc color of an existing location.
   * @param {String} name - The name of the location to update.
   * @param {String} newLabel - The new label for the location.
   * @param {String} newArcColor - The new color for the arc.
   */
  updateLocationArcColor(name, newArcColor) {
    const locIndex = this.locations.findIndex(loc => loc.name === name);

    if (locIndex === -1) {
      console.warn(`Location with name "${name}" not found.`);
      return;
    }

    // Update the location's arc color
    this.locations[locIndex].arcColor = newArcColor || this.locations[locIndex].arcColor;

    // Re-render the globe
    this.highlightPoints();
    this.drawArcs();
  }

}

customElements.define('globe-component', GlobeComponent);
