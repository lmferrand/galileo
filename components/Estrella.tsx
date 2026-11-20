// Una estrella de puntuación, dibujada. Con el carácter «★» el móvil tenía que cargar otra fuente del
// sistema la primera vez que se abría Aprender, y la pantalla daba un tirón.
export default function Estrella() {
  return (
    <svg className="estrella" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
    </svg>
  );
}
