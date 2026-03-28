varying float vY;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vY = (position.y - (-14.02)) / 58.33;
}