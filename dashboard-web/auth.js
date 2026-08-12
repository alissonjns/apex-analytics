function getToken() {
    return sessionStorage.getItem('cognito_id_token');
}

function checkAuthAndRedirect() {
    // Se voltar do Hosted UI com o token na URL
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    if (params.has('id_token')) {
        sessionStorage.setItem('cognito_id_token', params.get('id_token'));
        // Limpa a URL para ficar bonita
        window.history.replaceState(null, null, window.location.pathname);
        return true;
    }
    
    // Se já tem token salvo
    if (getToken()) {
        return true;
    }
    
    return false;
}

function login() {
    const domain = AWS_CONFIG.cognitoDomain;
    const clientId = AWS_CONFIG.clientId;
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    
    const url = `https://${domain}/login?client_id=${clientId}&response_type=token&scope=openid+email&redirect_uri=${redirectUri}`;
    window.location.href = url;
}

async function logout() {
    const token = getToken();
    if (token) {
        try {
            await fetch(`${AWS_CONFIG.apiUrl}/api/reset_sandbox`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (e) {
            console.error("Erro ao limpar sandbox:", e);
        }
    }
    sessionStorage.removeItem('cognito_id_token');
    localStorage.clear(); // Previne vazamento de dados de cache entre contas!
    window.location.reload();
}
