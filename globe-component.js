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
    }
    svg {
      width: 100%;
      height: 100%;
      cursor: grab;
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
  }

  render() {
    return html`<div id="globe-container"></div>`;
  }

  async firstUpdated() {
    const width = this.offsetWidth;
    const height = this.offsetHeight;

    // Initialize the SVG element
    this.svg = d3.select(this.renderRoot.querySelector('#globe-container'))
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Set up the projection, centering on the first location if available
    if (this.locations.length > 0) {
      const firstLocation = this.locations[0].coordinates;
      this.projection = d3.geoOrthographic()
        .scale(height / 2.1)
        .translate([width / 2, height / 2])
        .clipAngle(90)
        .rotate([-firstLocation[0], -firstLocation[1]]);
    } else {
      this.projection = d3.geoOrthographic()
        .scale(height / 2.1)
        .translate([width / 2, height / 2])
        .clipAngle(90)
        .rotate([-this.longitude, -this.latitude]);
    }

    this.path = d3.geoPath().projection(this.projection);

    // Convert TopoJSON to GeoJSON
    const countries = topojson.feature(worldData, worldData.objects.countries);

    // Draw the globe (sphere)
    this.svg.append('path')
      .datum({ type: 'Sphere' })
      .attr('class', 'globe')
      .attr('d', this.path);

    // Draw the land
    this.svg.append('g')
      .selectAll('path')
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
          .scale(height / 2.1)
          .translate([width / 2, height / 2])
          .rotate([-firstLocation[0], -firstLocation[1]]);
      } else {
        this.projection
          .scale(height / 2.1)
          .translate([width / 2, height / 2])
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
    }
  }
}

customElements.define('globe-component', GlobeComponent);
