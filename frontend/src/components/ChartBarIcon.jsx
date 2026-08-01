const ChartBarIcon = ({ size = "20px", handleClick }) => {
  return (
    <svg
      width={size}
      height={size}
      onClick={handleClick}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4.5" y="12" width="3.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="10.25" y="7.5" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="4.5" width="3.5" height="15" rx="1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default ChartBarIcon;
