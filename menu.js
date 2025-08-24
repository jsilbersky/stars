function chooseMode(mode) {
  localStorage.setItem("mode", mode);
  window.location.href = "index.html"; // spustí hru
}
