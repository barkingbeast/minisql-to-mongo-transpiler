(function (root) {
    const initial = () => ({lives: 3, score: 0, status: 'playing'});
    function resolve(state, hit) {
        if (state.status !== 'playing') return state;
        const next = {...state, lives: state.lives - (hit ? 1 : 0), score: state.score + (hit ? 0 : 10)};
        next.status = next.lives <= 0 ? 'lost' : next.score >= 50 ? 'won' : 'playing';
        return next;
    }
    root.ChaseRules = {initial, resolve};
    if (typeof module !== 'undefined') module.exports = root.ChaseRules;
})(typeof window === 'undefined' ? globalThis : window);
