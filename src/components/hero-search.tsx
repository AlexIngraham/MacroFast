const calorieTargets = [300, 500, 700, 1000];
const proteinTargets = [30, 40, 50, 60];

export function HeroSearch() {
  return (
    <section className="hero shell">
      <div className="eyebrow"><span className="live-dot" /> Official-source nutrition, made useful</div>
      <div className="hero-grid">
        <div>
          <h1>Hit your macros.<br /><span>Skip the menu math.</span></h1>
          <p>Find fast-food orders that fit your calorie budget and protein target in seconds.</p>
        </div>
        <form className="search-panel" action="/foods" method="get">
          <label htmlFor="home-search">Search foods or restaurants</label>
          <div className="search-row">
            <input id="home-search" name="q" placeholder="Try “50g protein under 600 calories”" />
            <button className="primary-button" type="submit">Find food <span aria-hidden="true">→</span></button>
          </div>
          <div className="quick-targets">
            <span>Calories</span>
            {calorieTargets.map((target) => (
              <a key={target} href={`/foods?maxCalories=${target}`}>≤ {target}</a>
            ))}
          </div>
          <div className="quick-targets">
            <span>Protein</span>
            {proteinTargets.map((target) => (
              <a key={target} href={`/foods?minProtein=${target}`}>{target}g+</a>
            ))}
          </div>
        </form>
      </div>
    </section>
  );
}
