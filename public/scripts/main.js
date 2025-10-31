document.addEventListener('DOMContentLoaded', () => {

    // Encontra os dois elementos: o botão e o menu
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');

    // Se ambos existirem...
    if (menuToggle && mobileNav) {
        // Adiciona um evento de clique ao botão
        menuToggle.addEventListener('click', () => {
            // Adiciona/remove a classe 'open' em AMBOS os elementos
            menuToggle.classList.toggle('open');
            mobileNav.classList.toggle('open');
        });
    }

});