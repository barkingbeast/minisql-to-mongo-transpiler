/* Deterministic scoring and fair attack patterns, shared by the game and tests. */
(function (root) {
    const TARGET = 400, SHIELD_SECONDS = .65, SHIELD_COOLDOWN = 5;
    const initial = () => ({lives:3, score:0, streak:0, dodges:0, bestStreak:0, status:'playing'});
    const phase = score => score < 100 ? 1 : score < 250 ? 2 : 3;
    function resolve(state, outcome, nearMiss=false) {
        if (state.status !== 'playing') return state;
        const hit = outcome === true || outcome === 'hit';
        const blocked = outcome === 'blocked';
        const streak = hit || blocked ? 0 : state.streak + 1;
        const multiplier = Math.min(3, 1 + Math.floor(streak / 4));
        const gain = hit || blocked ? 0 : 10 * multiplier + (nearMiss ? 5 : 0);
        const next = {...state, lives:state.lives - (hit ? 1 : 0), score:state.score + gain, streak,
            dodges:state.dodges + (hit || blocked ? 0 : 1), bestStreak:Math.max(state.bestStreak, streak)};
        next.status = next.lives <= 0 ? 'lost' : next.score >= TARGET ? 'won' : 'playing';
        return next;
    }
    function wave(score, playerLane, round, previousSafe=-1, random=Math.random) {
        const level = phase(score);
        // At least one open lane, and the safe lane changes every wave. No camping.
        const options = [0,1,2].filter(lane => lane !== previousSafe);
        const sample = Math.max(0, Math.min(.999999, random()));
        const safe = options[Math.floor(sample * options.length)];
        const double = level >= 2 || round % 3 === 0;
        const choices = [0,1,2].filter(lane => lane !== safe);
        const lanes = double ? choices : [choices.includes(playerLane) ? playerLane : choices[round % choices.length]];
        return {safe, lanes, level, warning: level === 1 ? .55 : level === 2 ? .45 : .35,
            travel:level === 1 ? 1.35 : level === 2 ? 1.05 : .8,
            gap:level === 1 ? .22 : .12,
            kind:double ? (level === 3 ? 'REPLY-ALL STORM' : 'DOUBLE EXCUSE') : 'TARGETED EXCUSE'};
    }
    root.ChaseRules = {initial, resolve, phase, wave, TARGET, SHIELD_SECONDS, SHIELD_COOLDOWN};
    if (typeof module !== 'undefined') module.exports = root.ChaseRules;
})(typeof window === 'undefined' ? globalThis : window);
