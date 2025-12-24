export class NotificationManager {
    constructor() {
        this.container = document.getElementById('notification-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notification-container';
            document.body.appendChild(this.container);
        }
    }

    show(message, type = 'info', duration = 3000) {
        const notif = document.createElement('div');
        notif.className = `notification notification-${type}`;

        const iconMap = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        notif.innerHTML = `
            <span class="notification-icon">${iconMap[type] || 'ℹ️'}</span>
            <span class="notification-message">${message}</span>
        `;

        this.container.appendChild(notif);

        // Trigger animation
        requestAnimationFrame(() => {
            notif.classList.add('show');
        });

        setTimeout(() => {
            notif.classList.remove('show');
            notif.addEventListener('transitionend', () => {
                notif.remove();
            });
        }, duration);
    }
}

export const notificationManager = new NotificationManager();
