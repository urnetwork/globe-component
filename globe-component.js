import { LitElement, html, css } from 'lit';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

// Import the inlined world map data
import worldData from './data/world-110m.v1.json';

/**
 * GlobeComponent
 * 
 * A reusable Web Component that renders an interactive 3D globe using D3.js and TopoJSON.
 * It highlights specified locations and draws arcs between them.
 * 
 * Properties:
 * - longitude (Number): Longitude of the initial center point.
 * - latitude (Number): Latitude of the initial center point.
 * - locations (Array): Array of location objects to highlight and connect with arcs.
 * 
 * Methods:
 * - setZoom(zoomLevel): Sets the zoom level programmatically.
 * - getZoom(): Retrieves the current zoom level.
 * - addLocation(location): Adds a new location to the globe.
 * - removeLocation(name): Removes a location from the globe by name.
 * 
 * Usage:
 * <globe-component
 *   longitude="-74.0060"
 *   latitude="40.7128"
 *   locations='[
 *     {"name": "New York", "coordinates": [-74.0060, 40.7128]},
 *     {"name": "London", "coordinates": [-0.1278, 51.5074]},
 *     {"name": "Tokyo", "coordinates": [139.6917, 35.6895]},
 *     {"name": "Sydney", "coordinates": [151.2093, -33.8688]}
 *   ]'
 *   style="width: 600px; height: 600px;"
 * ></globe-component>
 */
class GlobeComponent extends LitElement {
  static properties = {
    longitude: { type: Number },
    latitude: { type: Number },
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
      touch-action: none; /* Prevent default touch behaviors */
    }
    svg {
      width: 100%;
      height: 100%;
      cursor: grab;
      overflow: hidden; /* Prevent SVG elements from overflowing */
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
      stroke: blue;
      stroke-width: 1px;
    }
    .point {
      fill: red;
      stroke: #fff;
      stroke-width: 1px;
      cursor: pointer;
    }
    .tooltip {
      pointer-events: none;
      font-size: 12px;
      fill: black;
      stroke: white;
      stroke-width: 0.5px;
    }
  `;

  constructor() {
    super();
    // Default center point (New York City)
    this.longitude = -74.0060;
    this.latitude = 40.7128;

    // Default locations
    this.locations = [
      { name: 'New York', coordinates: [-74.0060, 40.7128] },
      { name: 'London', coordinates: [-0.1278, 51.5074] },
      { name: 'Tokyo', coordinates: [139.6917, 35.6895] },
    ];

    // Initialize arcs array
    this.arcs = [];

    // Placeholder for zoom behavior
    this.zoom = null;

    // Initial scale based on component's size
    this.initialScale = 300; // Will be recalculated based on container size
  }

  render() {
    return html`<div id="globe-container"></div>`;
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
    this.initialScale = Math.min(width, height) / 2.1;

    // Initialize the projection
    this.projection = d3.geoOrthographic()
      .scale(this.initialScale)
      .translate([width / 2, height / 2])
      .clipAngle(90)
      .rotate([-this.longitude, -this.latitude]);

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

    // Generate arcs between locations
    this.generateArcs();

    // Highlight all points
    this.highlightPoints();

    // Draw arcs
    this.drawArcs();

    // Make the globe draggable
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
    // Define the zoom behavior with scale limits
    const minScale = this.initialScale / 2; // Allow zooming out to half the initial scale
    const maxScale = this.initialScale * 3; // Allow zooming in up to 3 times the initial scale

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
   * Generates arcs between consecutive locations.
   */
  generateArcs() {
    this.arcs = []; // Reset arcs

    for (let i = 0; i < this.locations.length - 1; i++) {
      const source = this.locations[i].coordinates;
      const target = this.locations[i + 1].coordinates;

      // Validate coordinates
      if (Array.isArray(source) && source.length === 2 && Array.isArray(target) && target.length === 2) {
        const arc = this.createArc(source, target);
        this.arcs.push(arc);
      } else {
        console.warn(`Invalid coordinates for locations at index ${i} and ${i + 1}.`);
      }
    }
  }

  /**
   * Highlights all visible points on the globe.
   */
  highlightPoints() {
    // Remove existing points
    this.svg.selectAll('circle.point').remove();

    // Iterate over all locations
    this.locations.forEach(location => {
      const [lon, lat] = location.coordinates;

      // Validate coordinates
      if (typeof lon === 'number' && typeof lat === 'number') {
        const rotate = this.projection.rotate();
        const angle = d3.geoDistance([lon, lat], [-rotate[0], -rotate[1]]);

        if (angle < Math.PI / 2) { // Check if point is on the front side
          const point = this.projection([lon, lat]);

          // Create a group for point and tooltip
          const pointGroup = this.svg.append('g');

          pointGroup.append('circle')
            .attr('class', 'point')
            .attr('cx', point[0])
            .attr('cy', point[1])
            .attr('r', 5)
            .attr('fill', 'red')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .on('mouseover', () => {
              pointGroup.append('text')
                .attr('class', 'tooltip')
                .attr('x', point[0] + 10)
                .attr('y', point[1])
                .text(location.name)
                .style('font-size', '12px')
                .style('fill', 'black')
                .style('stroke', 'white')
                .style('stroke-width', '0.5px');
            })
            .on('mouseout', () => {
              pointGroup.select('text.tooltip').remove();
            });
        }
      } else {
        console.warn(`Invalid coordinates for location: ${location.name}`);
      }
    });
  }

  /**
   * Creates a GeoJSON LineString (arc) between two points using interpolation.
   * @param {Array} source - [longitude, latitude] of the source point.
   * @param {Array} target - [longitude, latitude] of the target point.
   * @returns {Object} - GeoJSON Feature representing the arc.
   */
  createArc(source, target) {
    const interpolate = d3.geoInterpolate(source, target);
    const steps = 50; // Number of intermediate points for smoothness
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
   * Draws arcs on the globe based on the generated arcs array.
   */
  drawArcs() {
    // Remove existing arcs
    this.svg.selectAll('path.arc').remove();

    // Draw the arcs
    this.svg.append('g')
      .selectAll('path.arc')
      .data(this.arcs)
      .enter()
      .append('path')
      .attr('class', 'arc')
      .attr('d', this.path)
      .attr('fill', 'none')
      .attr('stroke', 'blue')
      .attr('stroke-width', 1);
  }

  /**
   * Makes the globe draggable to rotate.
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
          this.projection.rotate([rotation[0] + dx / 2, rotation[1] - dy / 2]);

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

    // Convert locations to GeoJSON features
    const features = this.locations.map(loc => ({
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

    // Update projection's rotation to center on centroid
    this.projection.rotate([-centroid[0], -centroid[1]]);

    // Update projection's scale
    this.projection.scale(requiredScale);

    // Update path with the new projection
    this.path = d3.geoPath().projection(this.projection);

    // Update zoom's scaleExtent based on new scale
    const minScale = requiredScale / 2;
    const maxScale = requiredScale * 3;
    this.zoom.scaleExtent([minScale, maxScale]);

    // Re-render the globe, arcs, and points
    this.svg.selectAll('path').attr('d', this.path);
    this.generateArcs();
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
    this.initialScale = Math.min(width, height) / 2.1;
    this.projection.scale(this.initialScale);

    // Update zoom scale extent based on new size
    const minScale = this.initialScale / 2;
    const maxScale = this.initialScale * 3;
    this.zoom.scaleExtent([minScale, maxScale]);

    // Update the SVG size
    this.svg
      .attr('width', width)
      .attr('height', height);

    // Re-render the globe, arcs, and points
    this.path = d3.geoPath().projection(this.projection);
    this.svg.selectAll('path').attr('d', this.path);
    this.generateArcs();
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
    if (changedProperties.has('longitude') || changedProperties.has('latitude') || changedProperties.has('locations')) {
      const width = this.offsetWidth;
      const height = this.offsetHeight;

      if (this.locations.length > 0) {
        const firstLocation = this.locations[0].coordinates;
        this.projection
          .rotate([-firstLocation[0], -firstLocation[1]]);
      } else {
        this.projection
          .rotate([-this.longitude, -this.latitude]);
      }

      // Update path with the new projection
      this.path = d3.geoPath().projection(this.projection);
      this.svg.selectAll('path').attr('d', this.path);

      // Regenerate arcs based on new locations
      this.generateArcs();
      this.drawArcs();

      // Re-highlight points based on new locations
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
      this.locations = [...this.locations, location];
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
  }
}

customElements.define('globe-component', GlobeComponent);
