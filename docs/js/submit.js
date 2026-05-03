
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("submissionForm");
  if (!form) return;
  const type = form.dataset.type;
  const link = document.getElementById("issueLink");
  function updateLink() {
    const data = Object.fromEntries(new FormData(form).entries());
    const fields = type === "dish" ? {
      title: data.title,
      author: data.author,
      meal_types: data.meal_types,
      ingredients: data.ingredients,
      instructions: data.instructions,
      image: data.image
    } : {
      title: data.title,
      author: data.author,
      content: data.content,
      image: data.image
    };
    link.href = createIssueUrl(type, fields);
  }
  form.addEventListener("input", updateLink);
  form.addEventListener("submit", e => { e.preventDefault(); updateLink(); window.open(link.href, "_blank"); });
  updateLink();
});
