export function formatRelativeTime(ingestedAt, currentTime = new Date()) {
  if (!ingestedAt) return null;
  
  const ingestedDate = new Date(ingestedAt);
  const diffMs = currentTime - ingestedDate;
  
  let ageSec = Math.floor(diffMs / 1000);
  if (ageSec < 0) ageSec = 0;
  
  if (ageSec < 60) {
    return `${ageSec} sec${ageSec === 1 ? '' : 's'} ago`;
  }
  
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) {
    return `${ageMin} min${ageMin === 1 ? '' : 's'} ago`;
  }
  
  const ageHours = Math.floor(ageMin / 60);
  if (ageHours < 24) {
    return `${ageHours} hour${ageHours === 1 ? '' : 's'} ago`;
  }
  
  if (ageHours < 36) {
    return `Yesterday`;
  }
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(ingestedDate.getDate()).padStart(2, '0');
  const month = months[ingestedDate.getMonth()];
  const year = String(ingestedDate.getFullYear()).slice(-2);
  
  return `${day} ${month} ${year}`;
}
