varying float vY;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vY = (position.y - (-14.36)) / 59.72;
}