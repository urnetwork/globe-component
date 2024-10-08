import { LitElement, html, css } from 'lit';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

import worldData from './data/world-110m.v1.json';

class GlobeComponent extends LitElement {
  static properties = {
    longitude: { type: Number },
    latitude: { type: Number },
  };

  static styles = css`
    :host {
      display: block;
    }
    svg {
      width: 100%;
      height: 100%;
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
  `;

  constructor() {
    super();
    // Default coordinates (e.g., New York City)
    this.longitude = -74.0060;
    this.latitude = 40.7128;
  }

  render() {
    return html`<div id="globe-container"></div>`;
  }

  async firstUpdated() {
    const width = this.offsetWidth;
    const height = this.offsetHeight;

    this.svg = d3.select(this.renderRoot.querySelector('#globe-container'))
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Center the globe on the point by setting the rotation
    this.projection = d3.geoOrthographic()
      .scale(height / 2.1)
      .translate([width / 2, height / 2])
      .clipAngle(90)
      .rotate([-this.longitude, -this.latitude]);

    this.path = d3.geoPath().projection(this.projection);

    const countries = topojson.feature(worldData, worldData.objects.countries);

    // Draw the globe
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

    // Add graticules
    const graticule = d3.geoGraticule();
    this.svg.append('path')
      .datum(graticule)
      .attr('class', 'graticule')
      .attr('d', this.path);

    // Highlight the point
    this.highlightPoint();

    // Make the globe draggable
    this.makeGlobeDraggable();
  }

  highlightPoint() {
    this.svg.selectAll('circle.point').remove();

    const rotate = this.projection.rotate();
    const angle = d3.geoDistance(
      [this.longitude, this.latitude],
      [-rotate[0], -rotate[1]]
    );

    if (angle < Math.PI / 2) {
      const point = this.projection([this.longitude, this.latitude]);

      this.svg.append('circle')
        .attr('class', 'point')
        .attr('cx', point[0])
        .attr('cy', point[1])
        .attr('r', 5)
        .attr('fill', 'red')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1);
    }
  }

  makeGlobeDraggable() {
    let startRotate;

    this.svg.call(
      d3.drag()
        .on('start', (event) => {
          startRotate = [event.x, event.y];
        })
        .on('drag', (event) => {
          const dx = event.x - startRotate[0];
          const dy = event.y - startRotate[1];
          const rotation = this.projection.rotate();
          this.projection.rotate([rotation[0] + dx / 2, rotation[1] - dy / 2]);

          // Update paths and point
          this.svg.selectAll('path').attr('d', this.path);
          this.highlightPoint();

          startRotate = [event.x, event.y];
        })
    );
  }

  updated(changedProperties) {
    if (changedProperties.has('longitude') || changedProperties.has('latitude')) {
      const width = this.offsetWidth;
      const height = this.offsetHeight;

      this.projection
        .scale(height / 2.1)
        .translate([width / 2, height / 2])
        .rotate([-this.longitude, -this.latitude]);

      // Update paths and point
      this.svg.selectAll('path').attr('d', this.path);
      this.highlightPoint();
    }
  }
}

customElements.define('globe-component', GlobeComponent);
